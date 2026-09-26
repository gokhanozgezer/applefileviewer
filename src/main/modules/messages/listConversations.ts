import path from 'node:path';
import { openMessagesDb, openAddressBook } from './messagesDb';
import { buildContactLookup, lookupContact } from './contactLookup';
import { appleNanosToDate } from '@main/util/appleEpoch';
import type { Conversation, MessageService, MessagesConversationsRequest } from '@shared/domain';

interface ChatRow {
  chatId: bigint | null;
  identifier: string | null;
  displayName: string | null;
}

interface ChatStatRow {
  chatId: number;
  lastDate: bigint | null;
  lastText: string | null;
  msgCount: number;
  imessageCount: number;
  smsCount: number;
  handleId: string | null;
}

// message.date nanosecond MAX_SAFE_INTEGER üstü → BigInt zorunlu (precision korunur).
function toIso(raw: bigint | null): string | null {
  if (raw == null) return null;
  try {
    return appleNanosToDate(raw).toISOString();
  } catch {
    return null;
  }
}

export async function listConversations(
  req: MessagesConversationsRequest,
): Promise<Conversation[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openMessagesDb(req.udid, backupRoot);
  if (!db) return [];

  const abDb = await openAddressBook(req.udid, backupRoot);
  const contacts = buildContactLookup(abDb);

  try {
    const chats = db
      .prepare(
        `SELECT ROWID AS chatId, chat_identifier AS identifier, display_name AS displayName
         FROM chat`,
      )
      .safeIntegers(true)
      .all() as ChatRow[];

    // Sohbet başına istatistik: son mesaj tarihi/metni, sayım, service dağılımı, son handle.
    // service kolonu message ('iMessage'/'SMS'); NULL ise SMS varsay.
    // safeIntegers: MAX(m.date) BigInt (precision); sayım kolonları da BigInt → Number() coerce.
    const stats = db
      .prepare(
        `SELECT cmj.chat_id AS chatId,
                MAX(m.date) AS lastDate,
                COUNT(*) AS msgCount,
                SUM(CASE WHEN m.service = 'iMessage' THEN 1 ELSE 0 END) AS imessageCount,
                SUM(CASE WHEN m.service = 'iMessage' THEN 0 ELSE 1 END) AS smsCount
         FROM chat_message_join cmj
         JOIN message m ON m.ROWID = cmj.message_id
         GROUP BY cmj.chat_id`,
      )
      .safeIntegers(true)
      .all() as Array<{
      chatId: bigint;
      lastDate: bigint | null;
      msgCount: bigint;
      imessageCount: bigint;
      smsCount: bigint;
    }>;

    // Son mesaj metni — TEK sorgu (window fn; sohbet başına ayrı sorgu = N+1 idi).
    // better-sqlite3 kendi modern SQLite'ını gömer → ROW_NUMBER() her zaman mevcut.
    const lastRows = db
      .prepare(
        `SELECT chatId, text, handleId FROM (
           SELECT cmj.chat_id AS chatId, m.text AS text, h.id AS handleId,
                  ROW_NUMBER() OVER (
                    PARTITION BY cmj.chat_id ORDER BY m.date DESC, m.ROWID DESC
                  ) AS rn
           FROM chat_message_join cmj
           JOIN message m ON m.ROWID = cmj.message_id
           LEFT JOIN handle h ON h.ROWID = m.handle_id
         ) WHERE rn = 1`,
      )
      .safeIntegers(true)
      .all() as Array<{ chatId: bigint; text: string | null; handleId: string | null }>;

    const lastMap = new Map<number, { text: string | null; handleId: string | null }>();
    for (const r of lastRows) {
      lastMap.set(Number(r.chatId), { text: r.text, handleId: r.handleId });
    }

    const statMap = new Map<number, ChatStatRow>();
    for (const s of stats) {
      const chatId = Number(s.chatId);
      const last = lastMap.get(chatId);
      statMap.set(chatId, {
        chatId,
        lastDate: s.lastDate,
        lastText: last?.text ?? null,
        msgCount: Number(s.msgCount),
        imessageCount: Number(s.imessageCount),
        smsCount: Number(s.smsCount),
        handleId: last?.handleId ?? null,
      });
    }

    const conversations: Conversation[] = chats.map((c) => {
      const chatId = c.chatId == null ? 0 : Number(c.chatId);
      const st = statMap.get(chatId);
      const identifier = c.identifier ?? '';
      const contactName =
        lookupContact(identifier, contacts) ?? lookupContact(st?.handleId ?? null, contacts);
      const dominantService: MessageService =
        (st?.imessageCount ?? 0) >= (st?.smsCount ?? 0) ? 'iMessage' : 'SMS';
      // display_name çoğu NULL → kişi adı → chat_identifier fallback
      const displayName = (c.displayName ?? '').trim() || contactName || identifier || '—';
      return {
        chatId,
        displayName,
        identifier,
        contactName: contactName ?? null,
        lastMessagePreview: (st?.lastText ?? '').replace(/\s+/g, ' ').trim(),
        lastMessageDateIso: toIso(st?.lastDate ?? null),
        dominantService,
        messageCount: st?.msgCount ?? 0,
      };
    });

    // Boş sohbetleri (hiç mesaj yok) ele; son mesaj tarihine göre DESC sırala
    return conversations
      .filter((c) => c.messageCount > 0)
      .sort((a, b) => {
        const da = a.lastMessageDateIso ?? '';
        const db2 = b.lastMessageDateIso ?? '';
        return db2.localeCompare(da);
      });
  } finally {
    db.close();
    abDb?.close();
  }
}
