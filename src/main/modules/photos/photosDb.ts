import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * Photos.sqlite'ı tmp'ye snapshot'layıp açar (büyük db invariant'ı).
 * Path: Media/PhotoData/Photos.sqlite (NOT Library — Phase 3 gerçek-veri düzeltmesi).
 */
export async function openPhotosDb(udid: string, backupRoot: string): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(
      udid,
      backupRoot,
      'CameraRollDomain',
      'Media/PhotoData/Photos.sqlite',
    );
  } catch {
    return null; // Photos.sqlite yoksa (foto yok / farklı iOS) — null, crash değil
  }
}
