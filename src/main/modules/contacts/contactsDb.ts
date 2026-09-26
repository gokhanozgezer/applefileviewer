import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * AddressBook.sqlitedb konumu: HomeDomain / Library/AddressBook/AddressBook.sqlitedb.
 * ABPerson (kişiler) + ABMultiValue (telefon/email/adres) tabloları.
 *
 * GERÇEK-VERİ NOTU: domain `HomeDomain`,
 * relativePath `Library/AddressBook/AddressBook.sqlitedb`. 293 kişi (spot-check doğrulanmış).
 * Phase 8 messages/contactLookup.ts aynı db'yi mesaj isim çözümü için açıyor — burada
 * tam kişi listesi (telefon/email/adres/doğum günü/organizasyon) çıkarılır.
 */
export const CONTACTS_DOMAIN = 'HomeDomain';
export const CONTACTS_REL = 'Library/AddressBook/AddressBook.sqlitedb';

/**
 * AddressBook.sqlitedb'yi tmp'ye snapshot'layıp açar (sqlite gateway).
 * Dosya yoksa null (crash değil) → modül graceful empty state gösterir.
 */
export async function openContactsDb(udid: string, backupRoot: string): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(udid, backupRoot, CONTACTS_DOMAIN, CONTACTS_REL);
  } catch {
    return null; // AddressBook.sqlitedb yok — null (boş state)
  }
}
