import path from 'node:path';
import { stat } from '@main/safeFs';

const cache = new Map<string, number>(); // key: udid|backupRoot

/**
 * Manifest.plist mtime (ms). Cache key'in invalidation parçası — yedek
 * yenilenince mtime değişir, cache otomatik miss eder. safeFs.stat gateway.
 * Boot'ta yedek başına bir kez okunup memoize edilir.
 */
export async function getManifestMtimeMs(udid: string, backupRoot: string): Promise<number> {
  const k = `${udid}|${backupRoot}`;
  const cached = cache.get(k);
  if (cached !== undefined) return cached;
  const s = await stat(path.join(backupRoot, 'Manifest.plist'));
  cache.set(k, s.mtimeMs);
  return s.mtimeMs;
}

export function invalidateManifestMtime(udid: string, backupRoot: string): void {
  cache.delete(`${udid}|${backupRoot}`);
}

/** BACKUP_RESCAN: tüm memo'yu düşür — yeniden taramada yenilenmiş yedekler taze mtime alsın. */
export function invalidateAllManifestMtimes(): void {
  cache.clear();
}

/** Test-only */
export function _resetManifestMtimeCache(): void {
  cache.clear();
}
