import path from 'node:path';
import { openNotesDb } from './notesDb';
import { decodeNoteRich } from './noteProtoParser';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import type { Note, NotesRequest } from '@shared/domain';

interface NoteRow {
  id: number;
  title: string | null;
  snippet: string | null;
  created: number | null;
  modified: number | null;
  folderName: string | null;
  zdata: Buffer | null;
}

/**
 * ZCREATIONDATE/ZMODIFICATIONDATE Apple epoch SANİYE (FLOAT) → appleSecondsToDate.
 * Null/geçersiz → null.
 */
function toIso(raw: number | null): string | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  try {
    return appleSecondsToDate(raw).toISOString();
  } catch {
    return null;
  }
}

/**
 * ZICCLOUDSYNCINGOBJECT (not olanlar: ZNOTEDATA NOT NULL) → Note[].
 *
 * - body = decodeNoteBody(ZICNOTEDATA.ZDATA)  (gzip+protobuf decode)
 * - folder adı: ZFOLDER → ZICCLOUDSYNCINGOBJECT.ZTITLE2 (self-join)
 * - Silinen hariç: ZMARKEDFORDELETION != 1 VE klasör "Recently Deleted" değil.
 * - Sıralama: ZMODIFICATIONDATE DESC (en yeni ilk).
 *
 * Boş tablo / tablo yok / şema farkı → try/catch → [] (crash değil).
 */
export async function listNotes(req: NotesRequest): Promise<Note[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openNotesDb(req.udid, backupRoot);
  if (!db) return []; // NoteStore.sqlite yok — boş

  try {
    const rows = db
      .prepare(
        `SELECT
           obj.Z_PK            AS id,
           obj.ZTITLE1         AS title,
           obj.ZSNIPPET        AS snippet,
           obj.ZCREATIONDATE   AS created,
           obj.ZMODIFICATIONDATE AS modified,
           folder.ZTITLE2      AS folderName,
           nd.ZDATA            AS zdata
         FROM ZICCLOUDSYNCINGOBJECT obj
         JOIN ZICNOTEDATA nd ON nd.Z_PK = obj.ZNOTEDATA
         LEFT JOIN ZICCLOUDSYNCINGOBJECT folder ON folder.Z_PK = obj.ZFOLDER
         WHERE obj.ZNOTEDATA IS NOT NULL
           AND COALESCE(obj.ZMARKEDFORDELETION, 0) != 1
           AND COALESCE(folder.ZTITLE2, '') NOT IN ('Recently Deleted', 'Son Silinenler')
         ORDER BY obj.ZMODIFICATIONDATE DESC`,
      )
      .all() as NoteRow[];

    return rows.map((r) => {
      const rich = decodeNoteRich(r.zdata);
      return {
        id: r.id,
        title: (r.title ?? '').trim(),
        snippet: (r.snippet ?? '').trim(),
        body: rich.text,
        runs: rich.runs,
        createdIso: toIso(r.created),
        modifiedIso: toIso(r.modified),
        folderName: r.folderName ?? null,
      };
    });
  } catch {
    // ZICCLOUDSYNCINGOBJECT/ZICNOTEDATA yok veya şema farkı — boş liste (crash değil)
    return [];
  } finally {
    db.close();
  }
}
