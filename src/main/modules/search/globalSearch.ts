// globalSearch — komut paleti araması (Ctrl+K). 8 domain: Mesajlar, WhatsApp,
// Notlar, Kişiler, Aramalar, Sesli mesaj, Ses kayıtları, Fotoğraflar.
//
// Neden SQL LIKE değil: SQLite LIKE yalnız ASCII'de büyük/küçük harf duyarsız —
// 'şule' ↔ 'ŞULE', 'ışık' ↔ 'IŞIK' eşleşmez; ayrıca iOS 16+ mesaj metinlerinin bir
// kısmı yalnız `attributedBody` (typedstream BLOB) içinde. Bu yüzden her domain
// için katlanmış (fold.ts: case + Türkçe İ/ı + aksan) bir arama korpusu kurulur ve
// JS'te taranır. Korpus corpusCache'te snapshot yoluna (= mtime) bağlı tutulur:
// ilk arama kurar, sonraki tuş vuruşları yalnız bellekte `includes` taraması yapar.
// Snapshot'lar util/sqlite üzerinden (kopya mtime cache'li — tuş başına kopya yok).
//
// Domain'ler Promise.allSettled ile bağımsız koşar; biri düşerse diğerleri döner,
// düşen domain `failedDomains`'e yazılır (kısmi sonuç).

import path from 'node:path';
import { openMessagesDb, openAddressBook } from '@main/modules/messages/messagesDb';
import { decodeAttributedBody } from '@main/modules/messages/attributedBody';
import { buildContactLookup, lookupContact } from '@main/modules/messages/contactLookup';
import { openWhatsAppDb } from '@main/modules/whatsapp/whatsappDb';
import { openNotesDb } from '@main/modules/notes/notesDb';
import { decodeNoteBody } from '@main/modules/notes/noteProtoParser';
import { openContactsDb } from '@main/modules/contacts/contactsDb';
import { openCallsDb } from '@main/modules/calls/callsDb';
import { openVoicemailDb } from '@main/modules/voicemail/voicemailDb';
import { openVoiceMemosDb } from '@main/modules/voicememos/voiceMemosDb';
import { openPhotosDb } from '@main/modules/photos/photosDb';
import { computeFileId } from '@main/modules/manifest/fileId';
import { appleNanosToDate, appleSecondsToDate } from '@main/util/appleEpoch';
import type { ReadOnlyDb } from '@main/util/sqlite';
import { logger } from '@main/util/log';
import { foldText, buildSnippet, findMatch } from './fold';
import { getCorpus, scanCorpus, type CorpusRow } from './corpusCache';
import type {
  GlobalSearchRequest,
  GlobalSearchResult,
  SearchDomain,
  SearchHit,
} from '@shared/domain';

export { buildSnippet, foldText } from './fold';

export const QUERY_MIN = 2;
export const QUERY_MAX = 200;
const LIMIT_DEFAULT = 10;
const LIMIT_MAX = 50;
/** Korpusta alanları ayıran karakter — alanlar arası sahte eşleşmeyi önler. */
const SEP = '\u0001';

/** Sonuç grubu sırası (UI da aynı sırayı kullanır). */
export const SEARCH_DOMAINS: readonly SearchDomain[] = [
  'messages',
  'whatsapp',
  'notes',
  'contacts',
  'calls',
  'voicemail',
  'voicememos',
  'photos',
];

/** LIKE joker karakterlerini kaçır — kullanıcı girdisi desen değil, düz metindir. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Eşleşme çevresinden pencere kes (geri uyumlu string sürümü). */
export function makeSnippet(text: string, query: string, radius = 40): string {
  return buildSnippet(text, foldText(query), radius).snippet;
}

/**
 * Sorgu doğrulama: string değilse / kırpılmış uzunluk 2..200 dışındaysa null.
 */
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim();
  if (q.length < QUERY_MIN || q.length > QUERY_MAX) return null;
  return q;
}

/** Numara benzeri sorgudan yalnız rakamlar (≥3) — '(542) 365' ↔ '542365' eşleşsin. */
export function phoneDigits(q: string): string | null {
  if (!/^[\d\s()+\-.]+$/.test(q)) return null;
  const d = q.replace(/\D/g, '');
  return d.length >= 3 ? d : null;
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

function nanosToIso(raw: bigint | number | null): string | null {
  if (raw == null) return null;
  try {
    return appleNanosToDate(BigInt(raw)).toISOString();
  } catch {
    return null;
  }
}

function secondsToIso(raw: number | null): string | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  try {
    return appleSecondsToDate(raw).toISOString();
  } catch {
    return null;
  }
}

function unixSecondsToIso(raw: number | null): string | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const d = new Date(raw * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Tablo kolonları (küçük harf) — tablo yoksa boş küme. Şema farklarına dayanıklılık. */
function tableColumns(db: ReadOnlyDb, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name.toLowerCase()));
}

function textOf(v: unknown): string {
  if (v == null) return '';
  if (Buffer.isBuffer(v)) return v.toString('utf8').replace(/\0+$/, '').trim();
  return String(v).trim();
}

/** Alanlardan korpus metni: katlanmış, SEP ile ayrılmış. */
function foldFields(fields: readonly (string | null | undefined)[]): string {
  return foldText(fields.filter((f): f is string => !!f).join(SEP));
}

/**
 * İlk eşleşen alandan snippet; hiçbiri eşleşmezse `fallback` (vurgusuz).
 * Başlık eşleşmesi ayrıca titleMatch ile işaretlenir.
 */
function snippetFrom(
  fields: readonly (string | null | undefined)[],
  q: string,
  fallback = '',
): Pick<SearchHit, 'snippet' | 'snippetMatch'> {
  for (const f of fields) {
    if (!f) continue;
    const s = buildSnippet(f, q);
    if (s.match) return { snippet: s.snippet, snippetMatch: s.match };
  }
  return { snippet: fallback ? buildSnippet(fallback, '').snippet : '' };
}

interface Ctx {
  udid: string;
  backupRoot: string;
  /** Katlanmış sorgu. */
  q: string;
  /** Tarama iğneleri: katlanmış sorgu (+ numara benzeriyse rakamlar). */
  needles: string[];
  limit: number;
}

/** DB'yi aç → çalıştır → kapat. Opener null ise (dosya yok) boş sonuç. */
async function withDb(
  open: () => Promise<ReadOnlyDb | null>,
  fn: (db: ReadOnlyDb) => SearchHit[] | Promise<SearchHit[]>,
): Promise<SearchHit[]> {
  const db = await open();
  if (!db) return [];
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

// ── Messages (SMS/iMessage) ──────────────────────────────────────────────────

interface MsgMeta {
  id: number;
  chatId: number;
  date: bigint | null;
}

function buildMessagesCorpus(db: ReadOnlyDb): CorpusRow<MsgMeta>[] {
  const hasAb = tableColumns(db, 'message').has('attributedbody');
  // attributedBody yalnız text boşken çekilir — BLOB transferini minimumda tutar.
  const abSql = hasAb
    ? `CASE WHEN m.text IS NULL OR m.text = '' THEN m.attributedBody END`
    : 'NULL';
  const stmt = db
    .prepare(
      `SELECT m.ROWID AS id, cmj.chat_id AS chatId, m.date AS date, m.text AS text, ${abSql} AS ab
       FROM message m
       JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
       ORDER BY m.date DESC`,
    )
    .safeIntegers(true);
  const rows: CorpusRow<MsgMeta>[] = [];
  for (const r of stmt.iterate() as IterableIterator<{
    id: bigint;
    chatId: bigint;
    date: bigint | null;
    text: string | null;
    ab: Buffer | null;
  }>) {
    const text = r.text && r.text.length > 0 ? r.text : decodeAttributedBody(r.ab);
    if (!text) continue;
    rows.push({
      f: foldText(text),
      m: { id: Number(r.id), chatId: Number(r.chatId), date: r.date },
    });
  }
  return rows;
}

async function searchMessages(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openMessagesDb(ctx.udid, ctx.backupRoot),
    async (db) => {
      const corpus = getCorpus(`messages|${db.name}`, () => buildMessagesCorpus(db));
      const found = scanCorpus(corpus, ctx.needles, ctx.limit);
      if (found.length === 0) return [];

      // Orijinal metin yalnız eşleşenler için yeniden okunur (korpus sadece katlanmış tutar).
      const hasAb = tableColumns(db, 'message').has('attributedbody');
      const ids = found.map((r) => r.m.id);
      const originals = new Map<number, string>();
      for (const r of db
        .prepare(
          `SELECT ROWID AS id, text, ${hasAb ? 'attributedBody' : 'NULL'} AS ab
           FROM message WHERE ROWID IN (${ids.map(() => '?').join(',')})`,
        )
        .all(...ids) as Array<{ id: number; text: string | null; ab: Buffer | null }>) {
        originals.set(r.id, r.text && r.text.length > 0 ? r.text : decodeAttributedBody(r.ab));
      }

      // Sohbet başlığı: display_name → kişi adı (AddressBook) → chat_identifier.
      const chatIds = [...new Set(found.map((r) => r.m.chatId))];
      const chats = db
        .prepare(
          `SELECT ROWID AS id, display_name AS displayName, chat_identifier AS ident
           FROM chat WHERE ROWID IN (${chatIds.map(() => '?').join(',')})`,
        )
        .all(...chatIds) as Array<{ id: number; displayName: string | null; ident: string | null }>;
      const abDb = await openAddressBook(ctx.udid, ctx.backupRoot);
      let contacts: Map<string, string>;
      try {
        contacts = buildContactLookup(abDb);
      } finally {
        abDb?.close();
      }
      const titles = new Map<number, string>();
      for (const c of chats) {
        const dn = (c.displayName ?? '').trim();
        titles.set(c.id, dn || lookupContact(c.ident, contacts) || c.ident || '—');
      }

      return found.map((r) => {
        const title = titles.get(r.m.chatId) ?? '—';
        return {
          domain: 'messages' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom([originals.get(r.m.id)], ctx.q),
          dateIso: nanosToIso(r.m.date),
          chatId: r.m.chatId,
        };
      });
    },
  );
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

interface WaMeta {
  id: number;
  sessionId: number;
  date: number | null;
}

async function searchWhatsApp(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openWhatsAppDb(ctx.udid, ctx.backupRoot),
    (db) => {
      const corpus = getCorpus<WaMeta>(`whatsapp|${db.name}`, () => {
        const rows: CorpusRow<WaMeta>[] = [];
        for (const r of db
          .prepare(
            `SELECT Z_PK AS id, ZCHATSESSION AS sessionId, ZMESSAGEDATE AS date, ZTEXT AS text
             FROM ZWAMESSAGE
             WHERE ZTEXT IS NOT NULL AND ZTEXT != ''
             ORDER BY ZMESSAGEDATE DESC`,
          )
          .iterate() as IterableIterator<{
          id: number;
          sessionId: number;
          date: number | null;
          text: string;
        }>) {
          rows.push({ f: foldText(r.text), m: { id: r.id, sessionId: r.sessionId, date: r.date } });
        }
        return rows;
      });
      const found = scanCorpus(corpus, ctx.needles, ctx.limit);
      if (found.length === 0) return [];

      const ids = found.map((r) => r.m.id);
      const texts = new Map(
        (
          db
            .prepare(
              `SELECT m.Z_PK AS id, m.ZTEXT AS text, s.ZPARTNERNAME AS title
               FROM ZWAMESSAGE m LEFT JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION
               WHERE m.Z_PK IN (${ids.map(() => '?').join(',')})`,
            )
            .all(...ids) as Array<{ id: number; text: string | null; title: string | null }>
        ).map((r) => [r.id, r]),
      );

      return found.map((r) => {
        const row = texts.get(r.m.id);
        const title = (row?.title ?? '').trim() || '—';
        return {
          domain: 'whatsapp' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom([row?.text], ctx.q),
          dateIso: secondsToIso(r.m.date),
          sessionId: r.m.sessionId,
        };
      });
    },
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

interface NoteMeta {
  id: number;
  title: string;
  snippet: string;
  folder: string;
  body: string;
  modified: number | null;
}

async function searchNotes(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openNotesDb(ctx.udid, ctx.backupRoot),
    (db) => {
      const corpus = getCorpus<NoteMeta>(`notes|${db.name}`, () => {
        // Silinen hariç — listNotes.ts ile birebir aynı filtre.
        const rows = db
          .prepare(
            `SELECT obj.Z_PK AS id, obj.ZTITLE1 AS title, obj.ZSNIPPET AS snippet,
                    obj.ZMODIFICATIONDATE AS modified, folder.ZTITLE2 AS folder,
                    nd.ZDATA AS zdata
             FROM ZICCLOUDSYNCINGOBJECT obj
             JOIN ZICNOTEDATA nd ON nd.Z_PK = obj.ZNOTEDATA
             LEFT JOIN ZICCLOUDSYNCINGOBJECT folder ON folder.Z_PK = obj.ZFOLDER
             WHERE obj.ZNOTEDATA IS NOT NULL
               AND COALESCE(obj.ZMARKEDFORDELETION, 0) != 1
               AND COALESCE(folder.ZTITLE2, '') NOT IN ('Recently Deleted', 'Son Silinenler')
             ORDER BY obj.ZMODIFICATIONDATE DESC`,
          )
          .all() as Array<{
          id: number;
          title: string | null;
          snippet: string | null;
          modified: number | null;
          folder: string | null;
          zdata: Buffer | null;
        }>;
        return rows.map((r) => {
          let body = '';
          try {
            body = decodeNoteBody(r.zdata);
          } catch {
            body = ''; // bozuk gövde — başlık/önizleme yine aranır
          }
          const m: NoteMeta = {
            id: r.id,
            title: (r.title ?? '').trim(),
            snippet: (r.snippet ?? '').trim(),
            folder: (r.folder ?? '').trim(),
            body,
            modified: r.modified,
          };
          return { f: foldFields([m.title, m.snippet, m.folder, m.body]), m };
        });
      });

      return scanCorpus(corpus, ctx.needles, ctx.limit).map(({ m }) => {
        const title = m.title || '—';
        return {
          domain: 'notes' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom([m.body, m.snippet, m.folder], ctx.q, m.snippet || m.body),
          dateIso: secondsToIso(m.modified),
          noteId: m.id,
        };
      });
    },
  );
}

// ── Contacts ─────────────────────────────────────────────────────────────────

interface ContactMeta {
  id: number;
  name: string;
  org: string;
  values: string[];
}

async function searchContacts(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openContactsDb(ctx.udid, ctx.backupRoot),
    (db) => {
      const corpus = getCorpus<ContactMeta>(`contacts|${db.name}`, () => {
        const people = db
          .prepare(
            `SELECT ROWID AS id, First AS first, Last AS last, Organization AS org
             FROM ABPerson
             ORDER BY COALESCE(NULLIF(First,''), NULLIF(Last,''), Organization) COLLATE NOCASE`,
          )
          .all() as Array<{ id: number; first: unknown; last: unknown; org: unknown }>;
        const values = new Map<number, string[]>();
        for (const v of db
          .prepare(`SELECT record_id AS id, value FROM ABMultiValue WHERE value IS NOT NULL`)
          .iterate() as IterableIterator<{ id: number; value: unknown }>) {
          const s = textOf(v.value);
          if (!s) continue;
          const list = values.get(v.id);
          if (list) list.push(s);
          else values.set(v.id, [s]);
        }
        return people.map((p) => {
          const name = `${textOf(p.first)} ${textOf(p.last)}`.trim();
          const vals = values.get(p.id) ?? [];
          const m: ContactMeta = { id: p.id, name, org: textOf(p.org), values: vals };
          return { f: foldFields([name, m.org, ...vals, ...vals.map(digitsOf)]), m };
        });
      });

      return scanCorpus(corpus, ctx.needles, ctx.limit).map(({ m }) => {
        const title = m.name || m.org || '—';
        return {
          domain: 'contacts' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom(
            [m.name ? m.org : '', ...m.values],
            ctx.q,
            m.name && m.org ? m.org : (m.values[0] ?? ''),
          ),
          dateIso: null,
          contactId: m.id,
        };
      });
    },
  );
}

// ── Calls ────────────────────────────────────────────────────────────────────

interface CallMeta {
  id: number;
  date: number | null;
  number: string;
  name: string | null;
}

async function searchCalls(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openCallsDb(ctx.udid, ctx.backupRoot),
    async (db) => {
      // Kişi adı korpusa gömülür → anahtar AddressBook snapshot'ını da içerir.
      const abDb = await openAddressBook(ctx.udid, ctx.backupRoot);
      let corpus: CorpusRow<CallMeta>[];
      try {
        corpus = getCorpus<CallMeta>(`calls|${db.name}|${abDb?.name ?? ''}`, () => {
          const contacts = buildContactLookup(abDb);
          const rows = db
            .prepare(
              `SELECT Z_PK AS id, ZDATE AS date, ZADDRESS AS address
               FROM ZCALLRECORD ORDER BY ZDATE DESC`,
            )
            .all() as Array<{ id: number; date: number | null; address: unknown }>;
          return rows.map((r) => {
            const number = textOf(r.address);
            const name = number ? lookupContact(number, contacts) : null;
            return {
              f: foldFields([name, number, digitsOf(number)]),
              m: { id: r.id, date: r.date, number, name },
            };
          });
        });
      } finally {
        abDb?.close();
      }

      return scanCorpus(corpus, ctx.needles, ctx.limit).map(({ m }) => {
        const title = m.name || m.number || '—';
        return {
          domain: 'calls' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom([m.name ? m.number : ''], ctx.q, m.name ? m.number : ''),
          dateIso: secondsToIso(m.date),
          itemId: m.id,
        };
      });
    },
  );
}

// ── Voicemail ────────────────────────────────────────────────────────────────

interface VoicemailMeta {
  id: number;
  date: number | null;
  sender: string;
  name: string | null;
  transcript: string;
}

async function searchVoicemail(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openVoicemailDb(ctx.udid, ctx.backupRoot),
    async (db) => {
      const abDb = await openAddressBook(ctx.udid, ctx.backupRoot);
      let corpus: CorpusRow<VoicemailMeta>[];
      try {
        corpus = getCorpus<VoicemailMeta>(`voicemail|${db.name}|${abDb?.name ?? ''}`, () => {
          const cols = tableColumns(db, 'voicemail');
          // Transkript kolonu iOS sürümüne göre değişir / çoğu yedekte yok — varsa ara.
          const tCol = ['transcription', 'transcript'].find((c) => cols.has(c));
          const cbCol = cols.has('callback_num') ? 'callback_num' : 'NULL';
          const where = cols.has('trashed_date') ? 'WHERE trashed_date IS NULL' : '';
          const contacts = buildContactLookup(abDb);
          const rows = db
            .prepare(
              `SELECT ROWID AS id, date, sender, ${cbCol} AS callback,
                      ${tCol ?? 'NULL'} AS transcript
               FROM voicemail ${where} ORDER BY date DESC`,
            )
            .all() as Array<{
            id: number;
            date: number | null;
            sender: unknown;
            callback: unknown;
            transcript: unknown;
          }>;
          return rows.map((r) => {
            const sender = textOf(r.sender) || textOf(r.callback);
            const name = sender ? lookupContact(sender, contacts) : null;
            const transcript = textOf(r.transcript);
            return {
              f: foldFields([name, sender, digitsOf(sender), transcript]),
              m: { id: r.id, date: r.date, sender, name, transcript },
            };
          });
        });
      } finally {
        abDb?.close();
      }

      return scanCorpus(corpus, ctx.needles, ctx.limit).map(({ m }) => {
        const title = m.name || m.sender || '—';
        return {
          domain: 'voicemail' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom(
            [m.transcript, m.name ? m.sender : ''],
            ctx.q,
            m.transcript || (m.name ? m.sender : ''),
          ),
          // voicemail.date UNIX saniye (Apple epoch DEĞİL) — listVoicemails ile aynı.
          dateIso: unixSecondsToIso(m.date),
          itemId: m.id,
        };
      });
    },
  );
}

// ── Voice memos ──────────────────────────────────────────────────────────────

interface MemoMeta {
  id: number;
  date: number | null;
  title: string;
  file: string;
}

async function searchVoiceMemos(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openVoiceMemosDb(ctx.udid, ctx.backupRoot),
    (db) => {
      const corpus = getCorpus<MemoMeta>(`voicememos|${db.name}`, () => {
        const cols = tableColumns(db, 'ZCLOUDRECORDING');
        const encCol = cols.has('zencryptedtitle') ? 'ZENCRYPTEDTITLE' : 'NULL';
        const rows = db
          .prepare(
            `SELECT Z_PK AS id, ZDATE AS date, ZCUSTOMLABEL AS label,
                    ${encCol} AS encTitle, ZPATH AS zpath
             FROM ZCLOUDRECORDING ORDER BY ZDATE DESC`,
          )
          .all() as Array<{
          id: number;
          date: number | null;
          label: unknown;
          encTitle: unknown;
          zpath: unknown;
        }>;
        return rows.map((r) => {
          const zpath = textOf(r.zpath);
          const file = zpath ? path.basename(zpath, path.extname(zpath)) : '';
          // Başlık önceliği listVoiceMemos ile aynı: etiket → dosya adı.
          const title = textOf(r.label) || textOf(r.encTitle) || file;
          return {
            f: foldFields([title, textOf(r.encTitle), file]),
            m: { id: r.id, date: r.date, title, file },
          };
        });
      });

      return scanCorpus(corpus, ctx.needles, ctx.limit).map(({ m }) => {
        const title = m.title || '—';
        return {
          domain: 'voicememos' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom([m.file !== m.title ? m.file : ''], ctx.q),
          dateIso: secondsToIso(m.date),
          itemId: m.id,
        };
      });
    },
  );
}

// ── Photos ───────────────────────────────────────────────────────────────────

interface PhotoMeta {
  relativePath: string;
  filename: string;
  original: string;
  date: number | null;
}

async function searchPhotos(ctx: Ctx): Promise<SearchHit[]> {
  return withDb(
    () => openPhotosDb(ctx.udid, ctx.backupRoot),
    (db) => {
      const corpus = getCorpus<PhotoMeta>(`photos|${db.name}`, () => {
        // Orijinal dosya adı (IMG_1234.HEIC gibi, cihazdaki ad) ZADDITIONALASSETATTRIBUTES'ta;
        // tablo/kolon yoksa yalnız ZFILENAME aranır.
        const attrCols = tableColumns(db, 'ZADDITIONALASSETATTRIBUTES');
        const hasOrig = attrCols.has('zoriginalfilename') && attrCols.has('zasset');
        const rows = db
          .prepare(
            `SELECT a.ZDIRECTORY AS dir, a.ZFILENAME AS filename, a.ZDATECREATED AS date,
                    ${hasOrig ? 'attr.ZORIGINALFILENAME' : 'NULL'} AS original
             FROM ZASSET a
             ${hasOrig ? 'LEFT JOIN ZADDITIONALASSETATTRIBUTES attr ON attr.ZASSET = a.Z_PK' : ''}
             WHERE a.ZTRASHEDSTATE = 0 AND a.ZDIRECTORY IS NOT NULL AND a.ZFILENAME IS NOT NULL
             ORDER BY a.ZDATECREATED DESC`,
          )
          .all() as Array<{
          dir: string;
          filename: string;
          date: number | null;
          original: unknown;
        }>;
        return rows.map((r) => {
          const original = textOf(r.original);
          return {
            f: foldFields([original, r.filename]),
            m: {
              relativePath: `Media/${r.dir}/${r.filename}`,
              filename: r.filename,
              original,
              date: r.date,
            },
          };
        });
      });

      return scanCorpus(corpus, ctx.needles, ctx.limit).map(({ m }) => {
        const title = m.original || m.filename;
        return {
          domain: 'photos' as const,
          title,
          titleMatch: findMatch(title, ctx.q),
          ...snippetFrom([m.original ? m.filename : ''], ctx.q, m.original ? m.filename : ''),
          dateIso: secondsToIso(m.date),
          itemId: computeFileId('CameraRollDomain', m.relativePath),
        };
      });
    },
  );
}

// ── Orkestrasyon ─────────────────────────────────────────────────────────────

const RUNNERS: Record<SearchDomain, (ctx: Ctx) => Promise<SearchHit[]>> = {
  messages: searchMessages,
  whatsapp: searchWhatsApp,
  notes: searchNotes,
  contacts: searchContacts,
  calls: searchCalls,
  voicemail: searchVoicemail,
  voicememos: searchVoiceMemos,
  photos: searchPhotos,
};

export async function globalSearch(req: GlobalSearchRequest): Promise<GlobalSearchResult> {
  const t0 = Date.now();
  const query = normalizeQuery(req.query);
  if (query === null) return { hits: [], tookMs: 0 };
  const rawLimit = Number(req.limitPerDomain ?? LIMIT_DEFAULT);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(LIMIT_MAX, Math.floor(rawLimit)))
    : LIMIT_DEFAULT;

  const q = foldText(query);
  const digits = phoneDigits(query);
  const ctx: Ctx = {
    udid: req.udid,
    backupRoot: path.join(req.rootPath, req.udid),
    q,
    needles: digits && digits !== q ? [q, digits] : [q],
    limit,
  };

  const settled = await Promise.allSettled(SEARCH_DOMAINS.map((d) => RUNNERS[d](ctx)));

  const hits: SearchHit[] = [];
  const failedDomains: SearchDomain[] = [];
  settled.forEach((s, i) => {
    const domain = SEARCH_DOMAINS[i]!;
    if (s.status === 'fulfilled') {
      hits.push(...s.value);
    } else {
      failedDomains.push(domain);
      logger.warn(`[search] ${domain} arama hatası: ${(s.reason as Error)?.message ?? s.reason}`);
    }
  });

  return {
    hits,
    tookMs: Date.now() - t0,
    ...(failedDomains.length > 0 ? { failedDomains } : {}),
  };
}
