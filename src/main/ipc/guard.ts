// guard — IPC handler'ları için backupRef doğrulamasının Electron-bağımlı yüzü.
// Pure doğrulama mantığı modules/backup/backupRef.ts'te (test edilebilir);
// burası izinli kök listesini store + defaultPath (tüm varsayılan kökler)'ten, yedek kaydını
// backupRegistry'den toplar.

import { store } from '@main/store';
import { getDefaultBackupPaths } from '@main/modules/backup/defaultPath';
import { assertBackupRef, assertUsableBackupRef } from '@main/modules/backup/backupRef';
import { lookupBackup } from '@main/modules/backup/backupRegistry';
import { isBackupUnlocked } from '@main/modules/backup/encryptedSessions';

export {
  assertFileId,
  InvalidBackupRefError,
  BackupEncryptedError,
  encryptionUnknownError,
} from '@main/modules/backup/backupRef';

export function getAllowedRoots(): string[] {
  // Tüm varsayılan kökler (Windows: iTunes + Apple Devices; macOS: Finder; Linux: yok).
  const roots = [...getDefaultBackupPaths()];
  const override = store.get('ui.backupRootOverride');
  if (typeof override === 'string' && override.length > 0) {
    roots.push(override);
  }
  return roots;
}

/**
 * Yalnız biçim + izinli kök kontrolü — yedek henüz kayıtlı olmayabilir.
 * Sadece BACKUP_OPEN kullanır (plist'i kendisi okuyup kaydeder, şifreyi sonra denetler).
 */
export function guardBackupRefFormat(
  req: unknown,
): asserts req is { udid: string; rootPath: string } {
  assertBackupRef(req, getAllowedRoots());
}

/** Kayıt + oturum: şifreli yedeğin kilidi bu udid+kök için açık mı. */
function lookupWithUnlock(udid: string, rootPath: string) {
  const entry = lookupBackup(udid, rootPath);
  if (!entry) return undefined;
  return { ...entry, unlocked: entry.isEncrypted && isBackupUnlocked(udid, rootPath) };
}

/**
 * udid + rootPath taşıyan her IPC payload'ı modül katmanına inmeden bundan geçer.
 * Biçim + izinli kök + taranmış (bilinen) yedek + şifreli ise kilidi AÇIK.
 */
export function guardBackupRef(req: unknown): asserts req is { udid: string; rootPath: string } {
  assertUsableBackupRef(req, getAllowedRoots(), lookupWithUnlock);
}

/**
 * `{ udid, rootPath }` içeren istekleri doğrulayıp handler'a ileten sarmalayıcı —
 * ipcMain.handle(CHANNEL, withBackupRef(fn)) biçiminde kullanılır.
 */
export function withBackupRef<TReq extends { udid: string; rootPath: string }, TRes>(
  fn: (req: TReq) => TRes,
): (event: unknown, req: TReq) => TRes {
  return (_event, req) => {
    guardBackupRef(req);
    return fn(req);
  };
}
