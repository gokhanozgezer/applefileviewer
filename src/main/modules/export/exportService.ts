// exportService — saf format dönüştürücüler (fs DOKUNMAZ).
// Thread/kişi/not vb. domain nesnelerini string'e çevirir; yazma IPC katmanında
// safeFs.writeFileOut ile yapılır (copyFileOut ile aynı korunan-yedek-kökü kontrolü).
//
// Saf fonksiyonlar = unit test edilebilir (format çıktısı deterministik).
// HTML çıktısı inline CSS (export edilen dosya self-contained, harici asset yok).
// Her HTML <head>'i CSP meta taşır (script/ağ yasak — bkz. pdfPolicy).

import type {
  Conversation,
  Message,
  Contact,
  Note,
  CallRecord,
  Voicemail,
  VoiceMemo,
  WaConversation,
  WaMessage,
} from '@shared/domain';
import { EXPORT_CSP_META } from './pdfPolicy';

// ─── HTML escape ────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

// ─── CSV helper ──────────────────────────────────────────────────────────────

// CSV formula injection (OWASP): = + - @ TAB CR ile başlayan hücreyi Excel/LibreOffice
// formül olarak çalıştırabilir (yedekteki kişi adı/not/transkript saldırgan kontrollü
// olabilir). Başa ' eklenir → metin olarak gösterilir. İstisna: + / - ile başlayıp
// yalnız rakam, boşluk ve ( ) . , ; + - içeren değerler (sayı, telefon: "+90 555 111",
// "+905551112233; +905554445566") — fonksiyon adı/DDE (harf, | , =, @) içermediğinden
// kod çalıştıramaz; telefon numaraları bozulmasın diye değer korunur.
const FORMULA_START_RE = /^[=+\-@\t\r]/;
const NUMERIC_LIKE_RE = /^[+-][\d\s().,;+-]*$/;

export function csvCell(value: string): string {
  const safe = FORMULA_START_RE.test(value) && !NUMERIC_LIKE_RE.test(value) ? `'${value}` : value;
  // RFC 4180: çift tırnak içine al, içteki " → "".
  return `"${safe.replace(/"/g, '""')}"`;
}

// ─── Mesaj thread export ──────────────────────────────────────────────────────

export type MessageExportFormat = 'json' | 'html';

export function exportMessageThread(
  conversation: Conversation,
  messages: Message[],
  format: MessageExportFormat,
): string {
  if (format === 'json') {
    return JSON.stringify({ conversation, messages }, null, 2);
  }
  // HTML — basit bubble layout, inline CSS.
  const title = conversation.contactName || conversation.displayName || conversation.identifier;
  const bubbles = messages
    .map((m) => {
      const side = m.isFromMe ? 'me' : 'them';
      const bg = m.isFromMe ? '#0b93f6' : '#e5e5ea';
      const color = m.isFromMe ? '#ffffff' : '#000000';
      const align = m.isFromMe ? 'flex-end' : 'flex-start';
      const sender = m.isFromMe ? 'Ben' : m.contactName || m.handle || 'Karşı taraf';
      const attachLine =
        m.attachments.length > 0
          ? `<div class="att">[${m.attachments.length} ek: ${esc(
              m.attachments.map((a) => a.filename).join(', '),
            )}]</div>`
          : '';
      return `<div class="row ${side}" style="justify-content:${align}">
  <div class="bubble" style="background:${bg};color:${color}">
    <div class="meta">${esc(sender)} · ${esc(fmtDate(m.dateIso))} · ${esc(m.service)}</div>
    <div class="text">${esc(m.text) || '<em>(metin yok)</em>'}</div>
    ${attachLine}
  </div>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
${EXPORT_CSP_META}
<title>${esc(title)} — Sohbet Dışa Aktarımı</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #f4f4f7; margin: 0; padding: 24px; }
  h1 { font-size: 18px; color: #111; }
  .thread { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; }
  .bubble { max-width: 70%; padding: 8px 12px; border-radius: 16px; box-shadow: 0 1px 1px rgba(0,0,0,0.08); }
  .meta { font-size: 10px; opacity: 0.7; margin-bottom: 2px; }
  .text { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  .att { font-size: 11px; opacity: 0.85; margin-top: 4px; font-style: italic; }
</style>
</head>
<body>
<div class="thread">
<h1>${esc(title)} (${messages.length} mesaj)</h1>
${bubbles}
</div>
</body>
</html>`;
}

// ─── Kişi export ──────────────────────────────────────────────────────────────

export type ContactsExportFormat = 'json' | 'csv' | 'vcard';

export function exportContacts(contacts: Contact[], format: ContactsExportFormat): string {
  if (format === 'json') {
    return JSON.stringify(contacts, null, 2);
  }
  if (format === 'csv') {
    const header = [
      'displayName',
      'firstName',
      'lastName',
      'organization',
      'jobTitle',
      'phones',
      'emails',
      'addresses',
      'birthday',
      'note',
    ];
    const rows = contacts.map((c) =>
      [
        c.displayName,
        c.firstName ?? '',
        c.lastName ?? '',
        c.organization ?? '',
        c.jobTitle ?? '',
        c.phones.join('; '),
        c.emails.join('; '),
        c.addresses.join('; '),
        c.birthdayIso ?? '',
        c.note ?? '',
      ]
        .map((v) => csvCell(String(v)))
        .join(','),
    );
    return [header.map(csvCell).join(','), ...rows].join('\r\n');
  }
  // vCard 3.0 — kişi başına bir VCARD bloğu.
  return contacts.map(contactToVcard).join('\r\n');
}

function contactToVcard(c: Contact): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  // N: Last;First;;; — boş alanlar korunur
  lines.push(`N:${vesc(c.lastName)};${vesc(c.firstName)};;;`);
  lines.push(`FN:${vesc(c.displayName)}`);
  if (c.organization) lines.push(`ORG:${vesc(c.organization)}`);
  if (c.jobTitle) lines.push(`TITLE:${vesc(c.jobTitle)}`);
  for (const p of c.phones) lines.push(`TEL;TYPE=CELL:${vesc(p)}`);
  for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET:${vesc(e)}`);
  for (const a of c.addresses) lines.push(`ADR;TYPE=HOME:;;${vesc(a)};;;;`);
  if (c.birthdayIso) {
    const day = c.birthdayIso.slice(0, 10);
    if (day) lines.push(`BDAY:${day}`);
  }
  if (c.note) lines.push(`NOTE:${vesc(c.note)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// vCard değer escape: backslash, virgül, noktalı virgül, newline.
function vesc(s: string | null | undefined): string {
  if (s == null) return '';
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// ─── Not export ───────────────────────────────────────────────────────────────

export type NoteExportFormat = 'txt' | 'html';

export function exportNote(note: Note, format: NoteExportFormat): string {
  if (format === 'txt') {
    const head = [
      note.title,
      note.folderName ? `Klasör: ${note.folderName}` : '',
      note.createdIso ? `Oluşturuldu: ${fmtDate(note.createdIso)}` : '',
      note.modifiedIso ? `Değiştirildi: ${fmtDate(note.modifiedIso)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return `${head}\n${'-'.repeat(40)}\n${note.body}`;
  }
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
${EXPORT_CSP_META}
<title>${esc(note.title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; max-width: 720px; margin: 32px auto; padding: 0 16px; color: #111; }
  h1 { font-size: 20px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
  .body { font-size: 15px; white-space: pre-wrap; line-height: 1.5; }
</style>
</head>
<body>
<h1>${esc(note.title)}</h1>
<div class="meta">
  ${note.folderName ? `Klasör: ${esc(note.folderName)} · ` : ''}
  ${note.createdIso ? `Oluşturuldu: ${esc(fmtDate(note.createdIso))} · ` : ''}
  ${note.modifiedIso ? `Değiştirildi: ${esc(fmtDate(note.modifiedIso))}` : ''}
</div>
<div class="body">${esc(note.body)}</div>
</body>
</html>`;
}

// ─── Arama kaydı export ────────────────────────────────────────────────────────

export type CallLogExportFormat = 'json' | 'csv' | 'html';

const CALL_TYPE_LABEL: Record<CallRecord['callType'], string> = {
  phone: 'Telefon',
  'facetime-video': 'FaceTime Video',
  'facetime-audio': 'FaceTime Sesli',
};

function callDirectionLabel(c: CallRecord): string {
  if (c.isMissed) return 'Cevapsız';
  return c.direction === 'outgoing' ? 'Giden' : 'Gelen';
}

export function exportCallLog(calls: CallRecord[], format: CallLogExportFormat): string {
  if (format === 'json') {
    return JSON.stringify(calls, null, 2);
  }
  if (format === 'html') {
    return htmlTable(
      'Arama Geçmişi',
      `${calls.length} arama`,
      ['Tarih', 'Yön', 'Tür', 'Süre', 'Numara', 'Kişi'],
      calls.map((c) => [
        fmtDate(c.dateIso),
        callDirectionLabel(c),
        CALL_TYPE_LABEL[c.callType] ?? c.callType,
        fmtDuration(c.durationSec),
        c.number,
        c.contactName ?? '',
      ]),
    );
  }
  const header = [
    'date',
    'direction',
    'callType',
    'durationSec',
    'missed',
    'number',
    'contactName',
  ];
  const rows = calls.map((c) =>
    [
      c.dateIso ?? '',
      c.direction,
      c.callType,
      String(c.durationSec),
      c.isMissed ? 'yes' : 'no',
      c.number,
      c.contactName ?? '',
    ]
      .map((v) => csvCell(String(v)))
      .join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

// ─── Sesli mesaj / ses kaydı listesi export ─────────────────────────────────

export type AudioListExportFormat = 'csv' | 'html';

export function exportVoicemails(list: Voicemail[], format: AudioListExportFormat): string {
  if (format === 'html') {
    return htmlTable(
      'Sesli Mesajlar',
      `${list.length} sesli mesaj`,
      ['Tarih', 'Gönderen', 'Kişi', 'Süre', 'Dinlendi'],
      list.map((v) => [
        fmtDate(v.dateIso),
        v.sender,
        v.contactName ?? '',
        fmtDuration(v.durationSec),
        v.isUnplayed ? 'Hayır' : 'Evet',
      ]),
    );
  }
  const header = ['date', 'sender', 'contactName', 'durationSec', 'unplayed', 'fileId'];
  const rows = list.map((v) =>
    [
      v.dateIso ?? '',
      v.sender,
      v.contactName ?? '',
      String(v.durationSec),
      v.isUnplayed ? 'yes' : 'no',
      v.fileId,
    ]
      .map((x) => csvCell(String(x)))
      .join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

export function exportVoiceMemos(list: VoiceMemo[], format: AudioListExportFormat): string {
  if (format === 'html') {
    return htmlTable(
      'Ses Kayıtları',
      `${list.length} kayıt`,
      ['Tarih', 'Başlık', 'Süre'],
      list.map((m) => [fmtDate(m.dateIso), m.title, fmtDuration(m.durationSec)]),
    );
  }
  const header = ['date', 'title', 'durationSec', 'fileId'];
  const rows = list.map((m) =>
    [m.dateIso ?? '', m.title, String(m.durationSec), m.fileId]
      .map((x) => csvCell(String(x)))
      .join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

/** Süre: saniye → "1:23" / "1:02:05"; 0/negatif → "—". */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Basit tablo belgesi — liste export'ları (arama/sesli mesaj/ses kaydı) HTML/PDF. */
function htmlTable(title: string, subtitle: string, head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
${EXPORT_CSP_META}
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e3e3e8; vertical-align: top; }
  th { background: #f4f4f7; font-weight: 600; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<div class="sub">${esc(subtitle)}</div>
<table>
<thead><tr>${th}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</body>
</html>`;
}

// ─── Dosya uzantısı / öneri adı yardımcıları ───────────────────────────────────

// ─── WhatsApp thread export ──────────────────────────────────────────────────

export type WaExportFormat = 'json' | 'html';

export function exportWaThread(
  conversation: WaConversation,
  messages: WaMessage[],
  format: WaExportFormat,
): string {
  if (format === 'json') {
    return JSON.stringify({ conversation, messages }, null, 2);
  }
  const title = conversation.contactName || conversation.displayName || conversation.contactJid;
  const bubbles = messages
    .map((m) => {
      const side = m.isFromMe ? 'me' : 'them';
      const bg = m.isFromMe ? '#25d366' : '#e5e5ea';
      const color = m.isFromMe ? '#ffffff' : '#000000';
      const align = m.isFromMe ? 'flex-end' : 'flex-start';
      const sender = m.isFromMe ? 'Ben' : m.senderName || m.fromJid || 'Karşı taraf';
      const mediaLine = m.media
        ? `<div class="att">[medya: ${esc(m.media.localPath || m.media.mimeType || 'ek')}]</div>`
        : '';
      return `<div class="row ${side}" style="justify-content:${align}">
  <div class="bubble" style="background:${bg};color:${color}">
    <div class="meta">${esc(sender)} · ${esc(fmtDate(m.dateIso))}</div>
    <div class="text">${esc(m.text) || '<em>(metin yok)</em>'}</div>
    ${mediaLine}
  </div>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
${EXPORT_CSP_META}
<title>${esc(title)} — WhatsApp Dışa Aktarımı</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #f4f4f7; margin: 0; padding: 24px; }
  h1 { font-size: 18px; color: #111; }
  .row { display: flex; margin: 4px 0; }
  .bubble { max-width: 65%; border-radius: 14px; padding: 8px 12px; }
  .meta { font-size: 11px; opacity: 0.75; margin-bottom: 2px; }
  .text { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  .att { font-size: 12px; opacity: 0.85; margin-top: 4px; font-style: italic; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${bubbles}
</body>
</html>`;
}

/** PDF üretebilen kind'lar: HTML çıktısı olanlar (PDF = HTML → printToPDF). */
export function kindSupportsPdf(kind: string): boolean {
  return (
    kind === 'messageThread' ||
    kind === 'waThread' ||
    kind === 'note' ||
    kind === 'callLog' ||
    kind === 'voicemails' ||
    kind === 'voiceMemos'
  );
}

export function extForFormat(format: string): string {
  switch (format) {
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'pdf':
      return 'pdf';
    case 'csv':
      return 'csv';
    case 'vcard':
      return 'vcf';
    case 'txt':
      return 'txt';
    default:
      return 'txt';
  }
}
