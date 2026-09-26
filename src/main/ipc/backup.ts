import { dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import {
  IPC,
  type BackupLockResult,
  type BackupPickFolderResult,
  type BackupUnlockRequest,
  type OpenFullDiskAccessResult,
  type BackupUnlockResult,
} from '@shared/ipc';
import { store } from '@main/store';
import { scanBackupRoots, resolveBackupSource } from '@main/modules/backup/scan';
import { parseBackupDetails } from '@main/modules/backup/parsePlists';
import { getDefaultBackupRoots, getDefaultBackupPaths } from '@main/modules/backup/defaultPath';
import { MAC_FULL_DISK_ACCESS_URL, isSafeExternalUrl } from '@main/windowPolicy';
import type { BackupDetails, ScanResult } from '@shared/domain';
import { logger } from '@main/util/log';
import { setBackupRoot, protectBackupRoots, readdir, stat } from '@main/safeFs';
import { rememberBackupRoot, forgetBackupRootsUnder, clearBackupRootCache } from '@main/protocol';
import {
  guardBackupRefFormat,
  BackupEncryptedError,
  encryptionUnknownError,
  InvalidBackupRefError,
} from '@main/ipc/guard';
import { isValidUdid } from '@main/modules/backup/backupRef';
import {
  isBackupUnlocked,
  lockEncryptedBackup,
  unlockEncryptedBackup,
} from '@main/modules/backup/encryptedSessions';
import {
  invalidateManifestMtime,
  invalidateAllManifestMtimes,
} from '@main/modules/backup/manifestMtime';
import { registerBackup, replaceRegistry, lookupBackup } from '@main/modules/backup/backupRegistry';

/** Makul üst sınır — keyfi büyük payload PBKDF2'ye girmesin. */
const MAX_PASSWORD_LENGTH = 1024;

/**
 * backup:unlock payload doğrulaması: biçim + izinli kök (guardBackupRefFormat) + parola
 * string (1..1024). Parola hata mesajına ASLA girmez.
 */
export function assertUnlockRequest(req: unknown): asserts req is BackupUnlockRequest {
  guardBackupRefFormat(req);
  const pw = (req as { password?: unknown }).password;
  if (typeof pw !== 'string' || pw.length === 0 || pw.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidBackupRefError('parola geçersiz');
  }
}

/** 'ok' | 'invalid' (yedek yok) | 'permissionDenied' (listelenemedi — macOS TCC). */
async function checkBackupRoot(p: string): Promise<'ok' | 'invalid' | 'permissionDenied'> {
  let entries: string[];
  try {
    entries = await readdir(p);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'EPERM' || code === 'EACCES' ? 'permissionDenied' : 'invalid';
  }
  for (const name of entries) {
    if (!/^[a-f0-9-]{25,40}$/i.test(name)) continue;
    const infoPath = path.join(p, name, 'Info.plist');
    try {
      await stat(infoPath);
      return 'ok';
    } catch {
      /* ignore */
    }
  }
  return 'invalid';
}

function currentOverride(): string | null {
  const o = store.get('ui.backupRootOverride');
  return typeof o === 'string' && o.length > 0 ? o : null;
}

async function listBackups(): Promise<ScanResult> {
  const defaultRoots = getDefaultBackupRoots();
  const overridePath = currentOverride();
  const result = await scanBackupRoots({ defaultRoots, overridePath });
  // Guard + backup:// şifreli/bilinmeyen yedeği bu kayıttan reddeder.
  replaceRegistry(result.backups);
  // Kilit rozeti (BackupCard): oturum durumu yalnız main belleğinde.
  for (const b of result.backups) {
    b.unlocked = b.isEncrypted && isBackupUnlocked(b.udid, b.rootPath);
  }
  // Export yazımı hiçbir yedeğe / yedek üst köküne düşmesin (safeFs birikimli korur).
  protectBackupRoots([
    ...defaultRoots.map((r) => r.path),
    overridePath,
    ...result.backups.map((b) => path.join(b.rootPath, b.udid)),
  ]);
  return result;
}

export function registerBackupIpc(): void {
  // Tarama beklenmeden (ilk BACKUP_LIST öncesi export) üst kökler yazmaya kapalı olsun.
  protectBackupRoots([...getDefaultBackupPaths(), currentOverride()]);

  ipcMain.handle(IPC.BACKUP_LIST, async (): Promise<ScanResult> => listBackups());

  // Rescan = zorla taze tarama: mtime memo'su düşer (yenilenen yedekler yeni cache
  // anahtarı alır), kayıt tarama sonucuyla baştan kurulur.
  ipcMain.handle(IPC.BACKUP_RESCAN, async (): Promise<ScanResult> => {
    invalidateAllManifestMtimes();
    logger.info('[backup] rescan: manifest mtime memo temizlendi');
    return listBackups();
  });

  ipcMain.handle(IPC.BACKUP_OPEN, async (_e, payload: unknown): Promise<BackupDetails> => {
    // Biçim + izinli kök; yedek henüz kayıtlı olmayabilir (deep link / tarama öncesi)
    // — plist burada okunup kayda geçer, şifre denetimi sonra.
    guardBackupRefFormat(payload);
    const source = resolveBackupSource(
      payload.rootPath,
      getDefaultBackupRoots(),
      currentOverride(),
    );
    const details = await parseBackupDetails({
      udid: payload.udid,
      rootPath: payload.rootPath,
      source,
    });
    registerBackup(details);
    if (details.encryptionUnknown) {
      // Manifest.plist okunamadı → "şifresiz" varsayma (fail closed)
      logger.warn(`[backup] şifreleme durumu bilinmiyor, açma reddedildi: ${payload.udid}`);
      throw encryptionUnknownError();
    }
    if (details.isEncrypted) {
      // Kilidi açık (backup:unlock) şifreli yedek normal açılır; kilitli olan reddedilir.
      if (!isBackupUnlocked(payload.udid, payload.rootPath)) {
        logger.warn(`[backup] kilitli şifreli yedek açma reddedildi: ${payload.udid}`);
        throw new BackupEncryptedError(payload.udid);
      }
      details.unlocked = true;
    }
    const backupRoot = path.join(payload.rootPath, payload.udid);
    setBackupRoot(backupRoot);
    protectBackupRoots([payload.rootPath]);
    rememberBackupRoot(payload.udid, backupRoot);
    // Yedek açılırken mtime memosunu düşür — uygulama açıkken yenilenen yedek
    // (iTunes/Finder sync) eski mtime ile bayat cache'e düşmesin.
    invalidateManifestMtime(payload.udid, backupRoot);
    store.set('ui.lastSelectedUdid', payload.udid);
    return details;
  });

  // Şifreli yedeğin kilidini aç. Yalnız TARANMIŞ ve şifreli olduğu bilinen yedek kabul edilir
  // (keyfi klasörde PBKDF2 / dosya çözümü yok). PBKDF2 async (threadpool) — main bloke olmaz.
  // Parola hiçbir yere yazılmaz/loglanmaz; sonuç tiplidir (yanlış parola throw değil).
  ipcMain.handle(IPC.BACKUP_UNLOCK, async (_e, payload: unknown): Promise<BackupUnlockResult> => {
    assertUnlockRequest(payload);
    const { udid, rootPath, password } = payload;
    const entry = lookupBackup(udid, rootPath);
    if (!entry) throw new InvalidBackupRefError('yedek taranmamış veya bilinmiyor');
    if (entry.encryptionUnknown) throw encryptionUnknownError();
    if (!entry.isEncrypted) return { status: 'error', message: 'Yedek şifreli değil' };
    const t0 = Date.now();
    const result = await unlockEncryptedBackup({ udid, rootPath, password });
    if (result.status === 'ok') {
      logger.info(`[backup] şifreli yedek kilidi açıldı: ${udid} (${Date.now() - t0}ms)`);
    } else if (result.status === 'wrongPassword') {
      logger.warn(`[backup] yanlış parola: ${udid}`);
    } else {
      logger.error(`[backup] kilit açma hatası ${udid}: ${result.message}`);
    }
    return result;
  });

  // Kilitle: oturum kapanır, anahtarlar sıfırlanır, çözülmüş düz metin (oturum dizini +
  // türetilmiş cache + arama korpusu) silinir; backup:// bu udid için yeniden 403/404.
  ipcMain.handle(IPC.BACKUP_LOCK, async (_e, payload: unknown): Promise<BackupLockResult> => {
    const udid = (payload as { udid?: unknown } | null)?.udid;
    if (!isValidUdid(udid)) throw new InvalidBackupRefError('udid biçimi geçersiz');
    clearBackupRootCache(udid);
    const locked = await lockEncryptedBackup(udid);
    if (locked) logger.info(`[backup] şifreli yedek kilitlendi, oturum dizini silindi: ${udid}`);
    return { locked };
  });

  ipcMain.handle(IPC.BACKUP_PICK_FOLDER, async (): Promise<BackupPickFolderResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'showHiddenFiles'],
      title: 'iTunes yedek klasörünü seç',
      // macOS'ta dialog başlığı görünmez; açıklama message ile gösterilir.
      message: 'MobileSync/Backup klasörünü (ya da yedeklerin bulunduğu klasörü) seçin',
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const picked = result.filePaths[0]!;
    const check = await checkBackupRoot(picked);
    if (check !== 'ok') {
      return {
        canceled: false,
        valid: false,
        path: picked,
        ...(check === 'permissionDenied' ? { permissionDenied: true } : {}),
      };
    }
    store.set('ui.backupRootOverride', picked);
    protectBackupRoots([picked]);
    logger.info(`backupRootOverride set: ${picked}`);
    return { canceled: false, valid: true, path: picked };
  });

  ipcMain.handle(IPC.BACKUP_CLEAR_OVERRIDE, async () => {
    const oldOverride = currentOverride();
    store.set('ui.backupRootOverride', null);
    // Override kökündeki yedeklerin udid→kök eşlemesi backup:// tarafında bayat kalmasın.
    // YALNIZ eski override altındakiler unutulur — default kökteki (aktif olabilecek)
    // yedekler korunur (hepsini silmek aktif yedekte backup:// 404 veriyordu).
    // (safeFs koruması bilerek düşürülmez — oturum boyunca birikimli.)
    // Varsayılan köklerden birinin altındakiler korunur.
    if (oldOverride) forgetBackupRootsUnder(oldOverride, getDefaultBackupPaths());
    return { ok: true };
  });

  // macOS: yedek kökü TCC korumalı → Sistem Ayarları'nda Tam Disk Erişimi paneli.
  // URL renderer'dan ALINMAZ (sabit); windowPolicy yine de birebir izin listesinden geçirir.
  ipcMain.handle(IPC.BACKUP_OPEN_FULL_DISK_ACCESS, async (): Promise<OpenFullDiskAccessResult> => {
    if (process.platform !== 'darwin' || !isSafeExternalUrl(MAC_FULL_DISK_ACCESS_URL)) {
      return { opened: false };
    }
    try {
      await shell.openExternal(MAC_FULL_DISK_ACCESS_URL);
      return { opened: true };
    } catch (e) {
      logger.warn(`[backup] Tam Disk Erişimi paneli açılamadı: ${(e as Error).message}`);
      return { opened: false };
    }
  });
}
