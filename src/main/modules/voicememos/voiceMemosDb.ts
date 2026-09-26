import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * CloudRecordings.db konumu: AppDomainGroup-group.com.apple.VoiceMemos.shared /
 * Recordings/CloudRecordings.db. Core Data db.
 *
 * GERÇEK-VERİ NOTU: Tablo ZCLOUDRECORDING (ZRECORDING DEĞİL — gerçek-veride
 * ZRECORDING 0, ZCLOUDRECORDING 4). 4 kayıt (spot-check doğrulanmış).
 */
export const VOICEMEMOS_DOMAIN = 'AppDomainGroup-group.com.apple.VoiceMemos.shared';
const VOICEMEMOS_REL = 'Recordings/CloudRecordings.db';

/**
 * CloudRecordings.db'yi tmp'ye snapshot'layıp açar (büyük db invariant'ı — sqlite gateway).
 * Dosya yoksa null (crash değil) → modül graceful empty state gösterir.
 */
export async function openVoiceMemosDb(
  udid: string,
  backupRoot: string,
): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(udid, backupRoot, VOICEMEMOS_DOMAIN, VOICEMEMOS_REL);
  } catch {
    return null; // CloudRecordings.db yok — null (boş state)
  }
}
