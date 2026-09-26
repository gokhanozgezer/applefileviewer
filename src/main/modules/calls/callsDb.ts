import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * CallHistory.storedata için denenecek standart konumlar (sırayla).
 * Modern iOS: HomeDomain/Library/CallHistoryDB/CallHistory.storedata.
 * Bazı sürümlerde WirelessDomain altında. İlk bulunan kullanılır.
 *
 * GERÇEK-VERİ NOTU: Bu test yedeğinde native CallHistory.storedata YOK
 * (iCloud-senkron). openCallsDb null döner → modül graceful empty state gösterir.
 */
export const CALLS_DB_CANDIDATES: ReadonlyArray<{ domain: string; relativePath: string }> = [
  { domain: 'HomeDomain', relativePath: 'Library/CallHistoryDB/CallHistory.storedata' },
  { domain: 'WirelessDomain', relativePath: 'Library/CallHistoryDB/CallHistory.storedata' },
];

/**
 * CallHistory.storedata'yı tmp'ye snapshot'layıp açar (büyük db invariant'ı).
 * Önce HomeDomain, yoksa WirelessDomain denenir; hiçbiri yoksa null (crash değil).
 */
export async function openCallsDb(udid: string, backupRoot: string): Promise<ReadOnlyDb | null> {
  for (const candidate of CALLS_DB_CANDIDATES) {
    try {
      const db = await openBackupDb(udid, backupRoot, candidate.domain, candidate.relativePath);
      if (db) return db;
    } catch {
      // Bu konumda yok — sonraki adayı dene
    }
  }
  return null; // hiçbir konumda CallHistory.storedata yok — null (iCloud-senkron olabilir)
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
