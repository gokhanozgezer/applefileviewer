import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * WhatsApp paylaşılan app group domain'i. ChatStorage.sqlite + Media/ ekleri
 * bu domain altında saklanır.
 */
export const WA_DOMAIN = 'AppDomainGroup-group.net.whatsapp.WhatsApp.shared';

/**
 * ChatStorage.sqlite'ı tmp'ye snapshot'layıp açar (büyük db invariant'ı).
 * Domain: AppDomainGroup-group.net.whatsapp.WhatsApp.shared, relPath: ChatStorage.sqlite
 * WhatsApp yüklü olmayan yedekte yoksa null (crash değil).
 */
export async function openWhatsAppDb(udid: string, backupRoot: string): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(udid, backupRoot, WA_DOMAIN, 'ChatStorage.sqlite');
  } catch {
    return null; // ChatStorage.sqlite yoksa (WhatsApp yok / farklı şema) — null
  }
}

/**
 * AddressBook.sqlitedb'yi tmp'ye snapshot'layıp açar (Phase 8 ile aynı kaynak).
 * Lookup best-effort — yoksa null (kişi adı yerine numara).
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
