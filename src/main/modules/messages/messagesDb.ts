import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * sms.db'yi tmp'ye snapshot'layıp açar (büyük db invariant'ı).
 * Path: HomeDomain/Library/SMS/sms.db
 */
export async function openMessagesDb(udid: string, backupRoot: string): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(udid, backupRoot, 'HomeDomain', 'Library/SMS/sms.db');
  } catch {
    return null; // sms.db yoksa (mesaj yok / farklı iOS) — null, crash değil
  }
}

/**
 * AddressBook.sqlitedb'yi tmp'ye snapshot'layıp açar.
 * Path: HomeDomain/Library/AddressBook/AddressBook.sqlitedb
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
