import path from 'node:path';
import { openWhatsAppDb, openAddressBook } from './whatsappDb';
import { buildContactLookup, lookupContact } from '@main/modules/messages/contactLookup';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import type { WaConversation, WaConversationsRequest } from '@shared/domain';

interface SessionRow {
  sessionId: number;
  partnerName: string | null;
  contactJid: string | null;
  lastDate: number | null;
  lastText: string | null;
  msgCount: number;
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

/** JID'den telefon numarasını çıkarır (905xxx@s.whatsapp.net → 905xxx). */
function jidNumber(jid: string | null): string | null {
  if (!jid) return null;
  const at = jid.indexOf('@');
  const num = at >= 0 ? jid.slice(0, at) : jid;
  return /^\d+$/.test(num) ? num : null;
}

export async function listWaConversations(req: WaConversationsRequest): Promise<WaConversation[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openWhatsAppDb(req.udid, backupRoot);
  if (!db) return [];

  const abDb = await openAddressBook(req.udid, backupRoot);
  const contacts = buildContactLookup(abDb);

  try {
    // ZWACHATSESSION: her satır bir sohbet. ZMESSAGECOUNTER son mesaj sayımı,
    // ZLASTMESSAGEDATE son tarih, ZPARTNERNAME isim, ZCONTACTJID JID.
    // Son mesaj metnini ZWAMESSAGE'tan ayrı çekiyoruz (ZLASTMESSAGE FK güvenilmez).
    const rows = db
      .prepare(
        `SELECT s.Z_PK AS sessionId,
                s.ZPARTNERNAME AS partnerName,
                s.ZCONTACTJID AS contactJid,
                MAX(m.ZMESSAGEDATE) AS lastDate,
                COUNT(m.Z_PK) AS msgCount
         FROM ZWACHATSESSION s
         LEFT JOIN ZWAMESSAGE m ON m.ZCHATSESSION = s.Z_PK
         GROUP BY s.Z_PK`,
      )
      .all() as Array<Omit<SessionRow, 'lastText'>>;

    // Son mesaj metni — sohbet başına en yeni mesaj
    const lastTextStmt = db.prepare(
      `SELECT ZTEXT AS text
       FROM ZWAMESSAGE
       WHERE ZCHATSESSION = ?
       ORDER BY ZMESSAGEDATE DESC
       LIMIT 1`,
    );

    const conversations: WaConversation[] = rows.map((r) => {
      const jid = r.contactJid ?? '';
      const isGroup = jid.endsWith('@g.us');
      const last = lastTextStmt.get(r.sessionId) as { text: string | null } | undefined;
      const num = jidNumber(r.contactJid);
      const contactName = num ? lookupContact(num, contacts) : null;
      const displayName = (r.partnerName ?? '').trim() || contactName || num || jid || '—';
      return {
        sessionId: r.sessionId,
        displayName,
        contactJid: jid,
        contactName: contactName ?? null,
        isGroup,
        lastMessagePreview: (last?.text ?? '').replace(/\s+/g, ' ').trim(),
        lastMessageDateIso: toIso(r.lastDate),
        messageCount: Number(r.msgCount ?? 0),
      };
    });

    // Boş sohbetleri ele, son mesaj tarihine göre DESC
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
