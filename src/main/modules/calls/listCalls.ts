import path from 'node:path';
import { openCallsDb, openAddressBook } from './callsDb';
import { buildContactLookup, lookupContact } from '@main/modules/messages/contactLookup';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import type { CallDirection, CallRecord, CallType, CallsRequest } from '@shared/domain';

interface CallRow {
  id: number;
  date: number | null;
  duration: number | null;
  address: Buffer | string | null;
  originated: number | null;
  answered: number | null;
  callType: number | null;
}

// ZDATE Core Data SANİYE (Number path OK — MAX_SAFE_INTEGER altında). BigInt gerekmez.
function toIso(raw: number | null): string | null {
  if (raw == null) return null;
  try {
    return appleSecondsToDate(raw).toISOString();
  } catch {
    return null;
  }
}

/** ZADDRESS BLOB (Buffer) veya TEXT olabilir → numara string'ine çevir. */
function toNumber(address: Buffer | string | null): string {
  if (address == null) return '';
  if (Buffer.isBuffer(address)) {
    return address.toString('utf8').replace(/\0+$/, '').trim();
  }
  return String(address).trim();
}

/**
 * ZCALLTYPE → render tipi.
 * Tipik: 1 → telefon, 8 → FaceTime video, 16 → FaceTime audio.
 * Bilinmeyen değerler 'phone' fallback.
 */
function toCallType(raw: number | null): CallType {
  switch (raw) {
    case 8:
      return 'facetime-video';
    case 16:
      return 'facetime-audio';
    default:
      return 'phone';
  }
}

export async function listCalls(req: CallsRequest): Promise<CallRecord[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openCallsDb(req.udid, backupRoot);
  if (!db) return []; // CallHistory.storedata yok (iCloud-senkron olabilir) — boş

  const abDb = await openAddressBook(req.udid, backupRoot);
  const contacts = buildContactLookup(abDb);

  try {
    const rows = db
      .prepare(
        `SELECT Z_PK AS id, ZDATE AS date, ZDURATION AS duration, ZADDRESS AS address,
                ZORIGINATED AS originated, ZANSWERED AS answered, ZCALLTYPE AS callType
         FROM ZCALLRECORD
         ORDER BY ZDATE DESC`,
      )
      .all() as CallRow[];

    return rows.map((r) => {
      const number = toNumber(r.address);
      const direction: CallDirection = r.originated === 1 ? 'outgoing' : 'incoming';
      return {
        id: r.id,
        dateIso: toIso(r.date),
        durationSec: r.duration == null ? 0 : Math.max(0, Math.round(r.duration)),
        direction,
        isMissed: r.answered !== 1, // cevaplanmadıysa (0 veya null) → cevapsız
        callType: toCallType(r.callType),
        number,
        contactName: number ? lookupContact(number, contacts) : null,
      };
    });
  } catch {
    // ZCALLRECORD tablosu yok / şema farkı — boş liste (crash değil)
    return [];
  } finally {
    db.close();
    abDb?.close();
  }
}
