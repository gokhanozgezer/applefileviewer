import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * voicemail.db konumu: HomeDomain/Library/Voicemail/voicemail.db.
 * Klasik SQLite (Core Data DEĞİL). Tablo `voicemail`.
 *
 * GERÇEK-VERİ NOTU: Bu test yedeğinde voicemail tablosu BOŞ (0 kayıt).
 * Modül doğru mimari + empty state gösterir.
 */
const VOICEMAIL_REL = 'Library/Voicemail/voicemail.db';

/**
 * voicemail.db'yi tmp'ye snapshot'layıp açar (büyük db invariant'ı — sqlite gateway).
 * Dosya yoksa null (crash değil) → modül graceful empty state gösterir.
 */
export async function openVoicemailDb(
  udid: string,
  backupRoot: string,
): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(udid, backupRoot, 'HomeDomain', VOICEMAIL_REL);
  } catch {
    return null; // voicemail.db yok — null (boş state)
  }
}

/**
 * AddressBook.sqlitedb'yi tmp'ye snapshot'layıp açar (Phase 8 ile aynı kaynak).
 * Lookup best-effort — yoksa null (kişi adı yerine numara gösterilir).
 */
export async function openAddressBook(
  udid: string,
  backupRoot: string,
): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(
      udid,
      backupRoot,
      'HomeDomain',
      'Library/AddressBook/AddressBook.sqlitedb',
    );
  } catch {
    return null; // AddressBook yoksa — sessiz fail (numara fallback)
  }
}
