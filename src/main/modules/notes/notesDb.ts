import type { ReadOnlyDb } from '@main/util/sqlite';
import { openBackupDb } from '@main/modules/backup/resolveBackupFile';

/**
 * NoteStore.sqlite konumu: AppDomainGroup-group.com.apple.notes / NoteStore.sqlite.
 * Core Data db (ZICCLOUDSYNCINGOBJECT, ZICNOTEDATA). Not gövdesi ZICNOTEDATA.ZDATA
 * = gzip(protobuf) — en karmaşık parse (bkz. noteProtoParser.decodeNoteBody).
 *
 * GERÇEK-VERİ NOTU: domain `AppDomainGroup-group.com.apple.notes`,
 * relativePath `NoteStore.sqlite`. 61 not (spot-check doğrulanmış).
 */
const NOTES_DOMAIN = 'AppDomainGroup-group.com.apple.notes';
const NOTES_REL = 'NoteStore.sqlite';

/**
 * NoteStore.sqlite'ı tmp'ye snapshot'layıp açar (büyük db invariant'ı — sqlite gateway).
 * Dosya yoksa null (crash değil) → modül graceful empty state gösterir.
 */
export async function openNotesDb(udid: string, backupRoot: string): Promise<ReadOnlyDb | null> {
  try {
    return await openBackupDb(udid, backupRoot, NOTES_DOMAIN, NOTES_REL);
  } catch {
    return null; // NoteStore.sqlite yok — null (boş state)
  }
}
