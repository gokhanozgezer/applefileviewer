import crypto from 'node:crypto';
import path from 'node:path';

/**
 * iOS backup fileId = SHA1( domain + "-" + relativePath ), UTF-8, lowercase hex.
 * 4-kaynak doğrulanmış (Node crypto + sha1sum + Python hashlib + libimobiledevice).
 *
 * domain HER ZAMAN dolu (boş/null = programmer error → throw).
 * relativePath BOŞ olabilir ("" = root-level kayıt) ama null değil.
 */
export function computeFileId(domain: string, relativePath: string): string {
  if (typeof domain !== 'string' || domain.length === 0) {
    throw new Error(`computeFileId: domain boş/geçersiz: ${domain}`);
  }
  if (typeof relativePath !== 'string') {
    throw new Error(
      `computeFileId: relativePath string olmalı (boş OK, null değil): ${relativePath}`,
    );
  }
  return crypto.createHash('sha1').update(`${domain}-${relativePath}`, 'utf8').digest('hex');
}

/**
 * fileId → backup içindeki absolute path: <backupRoot>/<fileId[0:2]>/<fileId>
 * PURE path compute — fs erişimi YOK (dosyayı açmaz; açma backup:// protocol'ünde).
 */
export function fileIdToBackupPath(backupRoot: string, fileId: string): string {
  return path.join(backupRoot, fileId.slice(0, 2), fileId);
}
