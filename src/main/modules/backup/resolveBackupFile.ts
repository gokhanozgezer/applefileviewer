// resolveBackupFile — main'de bir yedek dosyasının (fileId) mutlak yolunu hesaplayan TEK yer.
// DB açıcılar (*Db.ts), backup:// protokolü (orig/thumb/orig-jpeg/transcode → decode worker +
// ffmpeg girdileri), export copyMedia/copyMediaBatch buradan geçer.
//
//   - Şifresiz yedek → <backupRoot>/<xx>/<fileId> (eski davranış; senkron hesap, fs yok).
//   - Kilidi açık şifreli yedek → Manifest.db'de Files kaydı → oturum dizinine tembel çözüm
//     (<oturum>/<xx>/<fileId>, in-flight dedupe). Kayıt yoksa null.
//   - Kilitli şifreli / şifrelemesi bilinmeyen yedek → null (şifreli blob asla servis edilmez;
//     guard + protokol zaten reddeder — savunma derinliği).
// safeFs okuma gateway'i değişmez: dönen yol yine safeFs.createReadStream/stat ile okunur.

import { computeFileId, fileIdToBackupPath } from '@main/modules/manifest/fileId';
import { isValidFileId } from '@main/modules/backup/backupRef';
import { isUdidEncrypted } from '@main/modules/backup/backupRegistry';
import { openReadOnlyInPlace, openReadOnlyTmp, type ReadOnlyDb } from '@main/util/sqlite';
import { isDecryptedPath, isUdidUnlocked, materializeEncryptedFile } from './encryptedSessions';

/**
 * fileId → okunacak mutlak yol (yoksa null). backupRoot = <rootPath>/<udid>.
 * signal: istek iptal edilirse (thumbnail kaydırıldı) bekleme biter; başka bekleyen yoksa
 * çözüm de iptal edilir.
 */
export async function resolveBackupFile(
  udid: string,
  backupRoot: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isValidFileId(fileId)) return null;
  if (isUdidUnlocked(udid)) return materializeEncryptedFile(udid, backupRoot, fileId, signal);
  if (isUdidEncrypted(udid)) return null;
  return fileIdToBackupPath(backupRoot, fileId);
}

/**
 * domain + relativePath'teki SQLite'ı salt-okunur açar; dosya yoksa null.
 * Şifresiz → tmp snapshot (util/sqlite gateway); çözülmüş → oturum dizininde yerinde
 * (ikinci düz metin kopya yok). Açma hatası fırlatılır (çağıran null'a çevirir).
 */
export async function openBackupDb(
  udid: string,
  backupRoot: string,
  domain: string,
  relativePath: string,
): Promise<ReadOnlyDb | null> {
  const abs = await resolveBackupFile(udid, backupRoot, computeFileId(domain, relativePath));
  if (!abs) return null;
  return isDecryptedPath(abs) ? openReadOnlyInPlace(abs) : openReadOnlyTmp({ udid, absPath: abs });
}
