import path from 'node:path';
import { openVoicemailDb, openAddressBook } from './voicemailDb';
import { buildContactLookup, lookupContact } from '@main/modules/messages/contactLookup';
import { computeFileId } from '@main/modules/manifest/fileId';
import type { Voicemail, VoicemailRequest } from '@shared/domain';

interface VoicemailRow {
  rowid: number;
  date: number | null;
  duration: number | null;
  sender: string | null;
  flags: number | null;
}

/**
 * voicemail.date UNIX epoch SANİYE (1970 tabanı) — Apple epoch DEĞİL!
 * new Date(date*1000), appleSecondsToDate KULLANILMAZ. (Tek tuzak.)
 */
function toIso(raw: number | null): string | null {
  if (raw == null) return null;
  const ms = raw * 1000;
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/**
 * voicemail tablosu → Voicemail[]. WHERE trashed_date IS NULL (silinmiş hariç)
 * ORDER BY date DESC (en yeni ilk). Ses dosyası: HomeDomain/Library/Voicemail/<ROWID>.amr.
 *
 * Boş tablo / tablo yok / şema farkı → try/catch → [] (crash değil).
 */
export async function listVoicemails(req: VoicemailRequest): Promise<Voicemail[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openVoicemailDb(req.udid, backupRoot);
  if (!db) return []; // voicemail.db yok — boş

  const abDb = await openAddressBook(req.udid, backupRoot);
  const contacts = buildContactLookup(abDb);

  try {
    const rows = db
      .prepare(
        `SELECT ROWID AS rowid, date, duration, sender, flags
         FROM voicemail
         WHERE trashed_date IS NULL
         ORDER BY date DESC`,
      )
      .all() as VoicemailRow[];

    return rows.map((r) => {
      const sender = (r.sender ?? '').trim();
      const fileId = computeFileId('HomeDomain', `Library/Voicemail/${r.rowid}.amr`);
      return {
        id: r.rowid,
        dateIso: toIso(r.date),
        durationSec: r.duration == null ? 0 : Math.max(0, Math.round(r.duration)),
        sender,
        contactName: sender ? lookupContact(sender, contacts) : null,
        fileId,
        isUnplayed: ((r.flags ?? 0) & 1) === 1,
      };
    });
  } catch {
    // voicemail tablosu yok / şema farkı — boş liste (crash değil)
    return [];
  } finally {
    db.close();
    abDb?.close();
  }
}
