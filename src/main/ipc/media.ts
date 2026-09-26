import path from 'node:path';
import { ipcMain } from 'electron';
import { IPC, type MediaPreheatRequest, type MediaPreheatResult } from '@shared/ipc';
import { logger } from '@main/util/log';
import { getRememberedRoot, ensureTranscodedCache } from '@main/protocol';
import { isValidUdid } from '@main/modules/backup/backupRef';
import { assertFileId, guardBackupRef, InvalidBackupRefError } from '@main/ipc/guard';

/**
 * media:preheat payload doğrulaması: udid biçimi, fileId (40 hex — path.join'e
 * giriyor, traversal), to ∈ {mp4, mp3}. İstek rootPath TAŞIMAZ; kök preheat
 * içinde getRememberedRoot'tan alınıp guardBackupRef'ten geçirilir.
 * Geçersiz payload → InvalidBackupRefError (invoke reddedilir, diğer guard'lar gibi).
 */
export function assertPreheatRequest(req: unknown): asserts req is MediaPreheatRequest {
  if (typeof req !== 'object' || req === null) {
    throw new InvalidBackupRefError('payload nesne değil');
  }
  const { udid, fileId, to } = req as { udid?: unknown; fileId?: unknown; to?: unknown };
  if (!isValidUdid(udid)) throw new InvalidBackupRefError('udid biçimi geçersiz');
  assertFileId(fileId);
  if (to !== 'mp4' && to !== 'mp3') {
    throw new InvalidBackupRefError("to geçersiz ('mp4' | 'mp3' bekleniyor)");
  }
}

/**
 * media:preheat — transcode'u önceden tetikle (cache pre-warm). Lightbox video
 * orig oynatmada hata alınca bunu çağırır; ready:true dönünce src'yi
 * backup://transcoded'a çevirir (cache hit → anında oynar).
 *
 * Cache zaten varsa hemen ready:true. Yoksa ffmpeg çalışır, biter, ready döner.
 * protocol#ensureTranscodedCache ile AYNI yol → streamTranscoded aynı anda aynı
 * dosyayı isterse tek transcode'a bağlanır (in-flight dedupe).
 */
export async function preheat(req: MediaPreheatRequest): Promise<MediaPreheatResult> {
  const root = getRememberedRoot(req.udid);
  if (!root) return { ready: false, error: 'Backup not opened' };
  // withBackupRef ile aynı guard: izinli kök (override temizlendiyse eski kök
  // reddedilir) + kayıtlı yedek + şifreli değil. İhlal → throw (invoke reddedilir).
  // Hatırlanan kök CİHAZ dizinidir (BACKUP_OPEN: join(rootPath, udid)) → rootPath = üst dizin.
  if (path.basename(root).toLowerCase() !== req.udid.toLowerCase()) {
    throw new InvalidBackupRefError('hatırlanan kök udid dizini değil');
  }
  guardBackupRef({ udid: req.udid, rootPath: path.dirname(root) });

  try {
    await ensureTranscodedCache(req.udid, root, req.fileId, req.to, '[media] preheat');
    return { ready: true };
  } catch (e) {
    logger.error(`[media] preheat transcode failed ${req.fileId}: ${(e as Error).message}`);
    return { ready: false, error: (e as Error).message };
  }
}

export function registerMediaIpc(): void {
  ipcMain.handle(IPC.MEDIA_PREHEAT, (_e, req: unknown): Promise<MediaPreheatResult> => {
    assertPreheatRequest(req);
    return preheat(req);
  });
}
