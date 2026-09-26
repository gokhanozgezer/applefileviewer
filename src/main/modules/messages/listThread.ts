import path from 'node:path';
import { openMessagesDb, openAddressBook } from './messagesDb';
import { buildContactLookup, lookupContact } from './contactLookup';
import { resolveAttachmentFileId, attachmentKind } from './attachmentResolver';
import { decodeAttributedBody } from './attributedBody';
import { appleNanosToDate } from '@main/util/appleEpoch';
import type {
  Attachment,
  Message,
  MessageService,
  MessagesThreadRequest,
  MessagesThreadResult,
  ThreadCursor,
} from '@shared/domain';

interface MessageRow {
  rowId: bigint | null;
  text: string | null;
  attributedBody: Buffer | null;
  service: string | null;
  isFromMe: bigint | null;
  date: bigint | null;
  handleId: string | null;
}

interface AttachmentRow {
  messageId: bigint | null;
  filename: string | null;
  mimeType: string | null;
}

// message.date nanosecond (800010409096004000) MAX_SAFE_INTEGER üstü → BigInt zorunlu.
// appleNanosToDate bigint path lossless; number path RangeError fırlatır (sessiz precision yasak).
function toIso(raw: bigint | null): string | null {
  if (raw == null) return null;
  try {
    return appleNanosToDate(raw).toISOString();
  } catch {
    return null;
  }
}

/** limit verilmezse sayfa boyutu. */
export const DEFAULT_THREAD_LIMIT = 500;
/** Tek istekte dönebilecek en fazla mesaj — renderer'dan gelen limit de kırpılır. */
export const MAX_THREAD_LIMIT = 2000;

/** limit → [1, MAX_THREAD_LIMIT] tamsayı; null/NaN → DEFAULT_THREAD_LIMIT. */
export function clampThreadLimit(limit: number | null | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_THREAD_LIMIT;
  return Math.min(MAX_THREAD_LIMIT, Math.max(1, Math.floor(limit)));
}

export async function listThread(req: MessagesThreadRequest): Promise<MessagesThreadResult> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openMessagesDb(req.udid, backupRoot);
  if (!db) return { items: [], total: 0 };

  const abDb = await openAddressBook(req.udid, backupRoot);
  const contacts = buildContactLookup(abDb);

  try {
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM chat_message_join WHERE chat_id = ?`)
      .get(BigInt(req.chatId)) as { total: number | bigint };

    // safeIntegers: message.date BigInt olarak gelsin (precision korunur). Diğer
    // integer kolonlar da BigInt döner — Number()/=== ile coerce edilir.
    // Keyset sayfalama — en yeni `limit` mesaj; `before` imleci daha eskilere iner.
    // limit verilmezse varsayılan sayfa (sınırsız SELECT yok — 100K+ mesajlık
    // sohbet tek IPC'de main'i/renderer'ı kilitliyordu). Üst sınır: MAX_THREAD_LIMIT.
    // COALESCE: date NULL satırlar imleç karşılaştırmasında kaybolmasın (0 = en eski).
    const limit = clampThreadLimit(req.limit);
    const params: bigint[] = [BigInt(req.chatId)];
    let cursorSql = '';
    if (req.before) {
      cursorSql = ` AND (COALESCE(m.date,0) < ? OR (COALESCE(m.date,0) = ? AND m.ROWID < ?))`;
      const dateNs = BigInt(req.before.dateNs);
      params.push(dateNs, dateNs, BigInt(req.before.rowId));
    }
    const page = db
      .prepare(
        `SELECT m.ROWID AS rowId, m.text AS text, m.attributedBody AS attributedBody,
                m.service AS service, m.is_from_me AS isFromMe, m.date AS date, h.id AS handleId
         FROM chat_message_join cmj
         JOIN message m ON m.ROWID = cmj.message_id
         LEFT JOIN handle h ON h.ROWID = m.handle_id
         WHERE cmj.chat_id = ?${cursorSql}
         ORDER BY COALESCE(m.date,0) DESC, m.ROWID DESC
         LIMIT ${limit}`,
      )
      .safeIntegers(true)
      .all(...params) as MessageRow[];

    let nextBefore: ThreadCursor | null = null;
    if (page.length === limit) {
      const oldest = page[page.length - 1]!;
      nextBefore = {
        dateNs: String(oldest.date ?? 0n),
        rowId: oldest.rowId == null ? 0 : Number(oldest.rowId),
      };
    }
    const rows = page.reverse(); // görüntüleme sırası ASC (eski → yeni)

    // Ekler: yalnızca dönen sayfanın mesajları için (sayfa dışı ek taşınmaz).
    const pageIds = rows.map((r) => (r.rowId == null ? 0n : BigInt(r.rowId)));
    const attRows =
      pageIds.length === 0
        ? []
        : (db
            .prepare(
              `SELECT maj.message_id AS messageId, a.filename AS filename, a.mime_type AS mimeType
               FROM message_attachment_join maj
               JOIN attachment a ON a.ROWID = maj.attachment_id
               WHERE maj.message_id IN (${pageIds.map(() => '?').join(',')})`,
            )
            .safeIntegers(true)
            .all(...pageIds) as AttachmentRow[]);

    const attByMsg = new Map<number, Attachment[]>();
    for (const a of attRows) {
      const mid = a.messageId == null ? -1 : Number(a.messageId);
      const list = attByMsg.get(mid) ?? [];
      list.push({
        fileId: resolveAttachmentFileId(a.filename),
        filename: a.filename ?? '',
        mimeType: a.mimeType,
        kind: attachmentKind(a.mimeType),
      });
      attByMsg.set(mid, list);
    }

    const items: Message[] = rows.map((r) => {
      const service: MessageService = r.service === 'iMessage' ? 'iMessage' : 'SMS';
      const contactName = lookupContact(r.handleId, contacts);
      const rowId = r.rowId == null ? 0 : Number(r.rowId);
      // text NULL/boş ise attributedBody'den (streamtyped NSAttributedString) metin çıkar.
      // Modern iOS 336 mesajı (gerçek-veri) burada tutar — yoksa "sadece tarih" görünür.
      const text =
        r.text && r.text.length > 0 ? r.text : decodeAttributedBody(r.attributedBody) || null;
      return {
        rowId,
        text,
        service,
        isFromMe: r.isFromMe === 1n,
        dateIso: toIso(r.date),
        handle: r.handleId,
        contactName: contactName ?? null,
        attachments: attByMsg.get(rowId) ?? [],
        isStarred: false,
      };
    });

    return { items, total: Number(total), nextBefore };
  } finally {
    db.close();
    abDb?.close();
  }
}
