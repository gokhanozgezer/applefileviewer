import path from 'node:path';
import { openWhatsAppDb, openAddressBook } from './whatsappDb';
import { buildContactLookup, lookupContact } from '@main/modules/messages/contactLookup';
import { resolveWaMediaFileId, waMediaKind, waMimeFromKind } from './waMediaResolver';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import type { ReadOnlyDb } from '@main/util/sqlite';
import type {
  WaMedia,
  WaMessage,
  WaThreadCursor,
  WaThreadRequest,
  WaThreadResult,
} from '@shared/domain';

interface MessageRow {
  messageId: number;
  text: string | null;
  isFromMe: number | null;
  date: number | null;
  fromJid: string | null;
  pushName: string | null;
  messageType: number | null;
  mediaItem: number | null;
  groupMember: number | null;
}

interface MediaRow {
  mediaId: number;
  localPath: string | null;
  xmppThumb: string | null;
  title: string | null;
}

// ZMESSAGEDATE SANİYE (Number path OK — MAX_SAFE_INTEGER altında). BigInt gerekmez.
function toIso(raw: number | null): string | null {
  if (raw == null) return null;
  try {
    return appleSecondsToDate(raw).toISOString();
  } catch {
    return null;
  }
}

function jidNumber(jid: string | null): string | null {
  if (!jid) return null;
  // BUG B-2: grup mesajında ZFROMJID = GRUP JID (905557654321-1595348486@g.us veya
  // 120363...@g.us), gönderen DEĞİL. Grup/broadcast/status JID'inden numara çıkarmak
  // 18-haneli grup ID'sini "gönderen numarası" gibi gösteriyordu. Sadece kişisel
  // (@s.whatsapp.net) JID'den numara çıkar; gerçek gönderen ZWAGROUPMEMBER.ZMEMBERJID'de.
  if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('status@')) return null;
  const at = jid.indexOf('@');
  const num = at >= 0 ? jid.slice(0, at) : jid;
  // Grup JID kalıntısı "905557654321-1595348486" tire içerir — saf rakam değilse reddet.
  return /^\d{6,15}$/.test(num) ? num : null;
}

/**
 * BUG B-2 — ZPUSHNAME bu yedekte gerçek isim DEĞİL, base64 protobuf blob'u içeriyor
 * (ör. "IAA=", "CPyf588GIABIAZABAPABAg=="). Spot-check: 39910 distinct ZPUSHNAME'in
 * tamamı base64, hiçbiri boşluk içermiyor. Bu blob'lar gönderen adı olarak ASLA
 * gösterilmemeli. Tespit: '=' padding'li + length%4==0 + strict base64 round-trip +
 * decode edilen byte'larda kontrol/yazdırılamaz byte var (gerçek ASCII isim değil).
 * Gerçek isimler (Ahmet, "Ahmet Yılmaz", Gökhan) bu testi geçmez → korunur.
 */
function looksLikeBase64Blob(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  // Gerçek isimler nadiren '=' padding ile biter; padding zorunlu tutuluyor.
  if (!/^[A-Za-z0-9+/]+={1,2}$/.test(t)) return false;
  if (t.length % 4 !== 0) return false;
  let buf: Buffer;
  try {
    buf = Buffer.from(t, 'base64');
  } catch {
    return false;
  }
  // Strict round-trip: tam base64 değilse (kayıplı decode) isim olabilir → koru.
  if (buf.toString('base64') !== t) return false;
  // Decode edilen byte'larda kontrol/non-text byte → binary blob, isim değil.
  for (const byte of buf) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte >= 0x7f) return true;
  }
  return false; // Temiz yazdırılabilir ASCII'ye decode oluyor → gerçek isim olabilir, koru.
}

/** ZPUSHNAME geçerli bir görünen isim mi (base64 blob/boş DEĞİL). */
function plausibleName(raw: string | null): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (looksLikeBase64Blob(t)) return null;
  return t;
}

/** ZWAMEDIAITEM tablosunda kolon var mı (şema versiyonu farklılığına dayanıklı). */
function waMediaItemHasColumn(db: ReadOnlyDb, column: string): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(ZWAMEDIAITEM)`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  } catch {
    return false;
  }
}

/** ZWAGROUPMEMBER varsa Z_PK → member adı/JID haritası kurar (grup gönderen adı). */
function buildGroupMemberMap(
  db: ReadOnlyDb,
): Map<number, { name: string | null; jid: string | null }> {
  const map = new Map<number, { name: string | null; jid: string | null }>();
  try {
    const rows = db
      .prepare(
        `SELECT Z_PK AS pk, ZCONTACTNAME AS name, ZFIRSTNAME AS firstName, ZMEMBERJID AS jid FROM ZWAGROUPMEMBER`,
      )
      .all() as Array<{
      pk: number;
      name: string | null;
      firstName: string | null;
      jid: string | null;
    }>;
    for (const r of rows) {
      // ZCONTACTNAME çoğu NULL — ZFIRSTNAME fallback (gerçek-veride üye adı buradan gelebilir).
      map.set(r.pk, { name: r.name ?? r.firstName, jid: r.jid });
    }
  } catch {
    // Tablo yok / şema farkı — boş map (grup gönderen adı çözülemez)
  }
  return map;
}

/** limit verilmezse sayfa boyutu. */
export const DEFAULT_WA_THREAD_LIMIT = 500;
/** Tek istekte dönebilecek en fazla mesaj — renderer'dan gelen limit de kırpılır. */
export const MAX_WA_THREAD_LIMIT = 2000;

/** limit → [1, MAX_WA_THREAD_LIMIT] tamsayı; null/NaN → DEFAULT_WA_THREAD_LIMIT. */
export function clampWaThreadLimit(limit: number | null | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_WA_THREAD_LIMIT;
  return Math.min(MAX_WA_THREAD_LIMIT, Math.max(1, Math.floor(limit)));
}

export async function listWaThread(req: WaThreadRequest): Promise<WaThreadResult> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openWhatsAppDb(req.udid, backupRoot);
  if (!db) return { items: [], total: 0 };

  const abDb = await openAddressBook(req.udid, backupRoot);
  const contacts = buildContactLookup(abDb);

  try {
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM ZWAMESSAGE WHERE ZCHATSESSION = ?`)
      .get(req.sessionId) as { total: number } | undefined;
    const total = Number(totalRow?.total ?? 0);

    // Keyset sayfalama (Messages listThread ile aynı desen) — en yeni `limit`
    // mesaj; `before` imleci daha eskilere iner. 104K mesajlık sohbet artık tek
    // IPC'de taşınmaz. COALESCE: ZMESSAGEDATE NULL satırlar imleçte kaybolmasın.
    const limit = clampWaThreadLimit(req.limit);
    const params: number[] = [req.sessionId];
    let cursorSql = '';
    if (req.before) {
      cursorSql = ` AND (COALESCE(ZMESSAGEDATE,0) < ? OR (COALESCE(ZMESSAGEDATE,0) = ? AND Z_PK < ?))`;
      params.push(req.before.date, req.before.date, req.before.messageId);
    }
    const page = db
      .prepare(
        `SELECT Z_PK AS messageId, ZTEXT AS text, ZISFROMME AS isFromMe,
                ZMESSAGEDATE AS date, ZFROMJID AS fromJid, ZPUSHNAME AS pushName,
                ZMESSAGETYPE AS messageType, ZMEDIAITEM AS mediaItem,
                ZGROUPMEMBER AS groupMember
         FROM ZWAMESSAGE
         WHERE ZCHATSESSION = ?${cursorSql}
         ORDER BY COALESCE(ZMESSAGEDATE,0) DESC, Z_PK DESC
         LIMIT ${limit}`,
      )
      .all(...params) as MessageRow[];

    let nextBefore: WaThreadCursor | null = null;
    if (page.length === limit) {
      const oldest = page[page.length - 1]!;
      nextBefore = { date: oldest.date ?? 0, messageId: oldest.messageId };
    }
    const rows = page.reverse(); // görüntüleme sırası ASC (eski → yeni)

    // Medya ekleri — ZWAMEDIAITEM Z_PK → localPath (+ ZTITLE document dosya adı).
    // Yalnızca dönen sayfanın medya satırları (sayfa dışı medya taşınmaz).
    // ZTITLE şema versiyonuna göre olmayabilir → PRAGMA ile yokla, yoksa NULL seç.
    const hasTitle = waMediaItemHasColumn(db, 'ZTITLE');
    const titleSelect = hasTitle ? 'i.ZTITLE AS title' : 'NULL AS title';
    // BUG 1 — Gerçek-veride medyaların %92'si indirilmemiş: ZMEDIALOCALPATH NULL ama
    // ZXMPPTHUMBPATH (küçük resim) dolu. Aynı `Media/...` formatında → Message/ prefix
    // ile fileId çözülür (resolveWaMediaFileId). localPath yoksa thumbnail'e düş.
    const hasXmppThumb = waMediaItemHasColumn(db, 'ZXMPPTHUMBPATH');
    const xmppThumbSelect = hasXmppThumb ? 'i.ZXMPPTHUMBPATH AS xmppThumb' : 'NULL AS xmppThumb';
    const mediaIds = Array.from(
      new Set(rows.map((r) => r.mediaItem).filter((id): id is number => id != null)),
    );
    const mediaRows =
      mediaIds.length === 0
        ? []
        : (db
            .prepare(
              `SELECT i.Z_PK AS mediaId, i.ZMEDIALOCALPATH AS localPath, ${xmppThumbSelect}, ${titleSelect}
               FROM ZWAMEDIAITEM i
               WHERE i.Z_PK IN (${mediaIds.map(() => '?').join(',')})`,
            )
            .all(...mediaIds) as MediaRow[]);

    const mediaById = new Map<number, MediaRow>();
    for (const m of mediaRows) mediaById.set(m.mediaId, m);

    const memberMap = buildGroupMemberMap(db);

    const items: WaMessage[] = rows.map((r) => {
      const isFromMe = r.isFromMe === 1;

      // Medya çözümü
      let media: WaMedia | null = null;
      if (r.mediaItem != null) {
        const mr = mediaById.get(r.mediaItem);
        // Full media yoksa (indirilmemiş) XMPP thumbnail'e düş — aynı format,
        // fileId Message/ prefix ile çözülür.
        const fullPath = mr?.localPath ?? null;
        const sourcePath = fullPath ?? mr?.xmppThumb ?? null;
        const isThumbnailOnly = !fullPath && !!mr?.xmppThumb;
        const fileId = resolveWaMediaFileId(sourcePath);
        const kind = waMediaKind(r.messageType);
        if (mr || fileId) {
          media = {
            fileId,
            localPath: sourcePath ?? '',
            mimeType: waMimeFromKind(kind),
            kind,
            title: (mr?.title ?? '').trim() || null,
            isThumbnailOnly,
          };
        }
      }

      // Gönderen adı çözümleme (BUG B-2): base64/ham stanza ID ASLA gösterilmez.
      // ZPUSHNAME (geçerli isimse) → ZWAGROUPMEMBER.ZCONTACTNAME → AddressBook (numara)
      // → numara. Hiçbiri yoksa null (UI "Bilinmeyen" gösterir, base64 DEĞİL).
      let senderName: string | null = null;
      if (!isFromMe) {
        const member = r.groupMember != null ? memberMap.get(r.groupMember) : undefined;
        // member.jid (ZWAGROUPMEMBER.ZMEMBERJID = gerçek gönderen) ÖNCE; fromJid grup
        // mesajında GRUP JID olduğu için jidNumber onu zaten reddeder. Kişisel sohbette
        // member yok → fromJid (@s.whatsapp.net) numarası kullanılır.
        const num = jidNumber(member?.jid ?? null) ?? jidNumber(r.fromJid);
        const contactName = num ? lookupContact(num, contacts) : null;
        senderName =
          plausibleName(r.pushName) ??
          plausibleName(member?.name ?? null) ??
          contactName ??
          num ??
          null;
      }

      return {
        messageId: r.messageId,
        text: r.text,
        isFromMe,
        dateIso: toIso(r.date),
        fromJid: r.fromJid,
        senderName,
        messageType: r.messageType,
        media,
      };
    });

    return { items, total, nextBefore };
  } finally {
    db.close();
    abDb?.close();
  }
}
