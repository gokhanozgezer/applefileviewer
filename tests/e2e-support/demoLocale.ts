// E2E / ekran görüntüsü demo yedeğini İNGİLİZCE içeriğe çevirir.
//
// Birim test fixture'ları bilerek Türkçe (Türkçe karakter katlama/arama testleri) —
// onlara dokunulmaz. Demo yedek ise sitede ve README'de İngilizce arayüzle gösteriliyor;
// "En yeni not", "Merhaba" gibi değerler orada tutarsız duruyordu. Fixture'lar yazıldıktan
// SONRA her DB'deki metin hücreleri burada yeniden yazılır (şema ve ilişkiler aynı kalır).
//
// Telefon numaraları ABD'nin kurgusal aralığına (555-01xx) taşınır — gerçek bir kişiye
// ait olamaz. WhatsApp JID'leri, arama geçmişi (UTF-8 BLOB) ve kişi kayıtları tutarlı eşlenir.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { computeFileId } from '../../src/main/modules/manifest/fileId';
import { buildNoteZdata } from '../modules/notes/notesFixture';

/** Rakam dizisi eşlemesi — '+', JID ('…@s.whatsapp.net') ve BLOB biçimlerinde de uygulanır. */
const NUMBER_MAP: Array<[string, string]> = [
  ['905551234567', '12025550101'],
  ['905001112233', '12025550102'],
  ['905999998877', '12025550103'],
  ['905111111111', '12025550104'],
  ['905111222333', '12025550105'],
  ['905999999999', '12025550106'],
];

/** Hücre değeri TAM eşleşirse değiştirilir (kısmi eşleşme kelime içlerini bozmasın). */
const TEXT_MAP: Record<string, string> = {
  // Mesajlar
  Merhaba: 'Hey! Are we still on for lunch tomorrow?',
  'Selam nasilsin': 'Yes — 12:30 at the usual place?',
  'Iyiyim tesekkurler': 'Perfect, see you there!',
  'Kod: 1234': 'Your verification code is 482913',
  Tamam: 'Sounds good, thanks!',
  'tkgm sistem': 'Service Alerts',
  // WhatsApp
  'Aile Grubu': 'Family Group',
  'Boş Sohbet': 'Book Club',
  Mehmet: 'Oliver',
  'Mehmet K.': 'Oliver B.',
  'Grup mesaji': 'Dinner at 7 on Sunday?',
  // Kişiler
  Ahmet: 'Emma',
  Yılmaz: 'Johnson',
  Yilmaz: 'Johnson',
  Mühendis: 'Software Engineer',
  'iş arkadaşı': 'Colleague from the design team',
  Berk: 'Liam',
  Demir: 'Carter',
  'Acme A.Ş.': 'Acme Inc.',
  Zeynep: 'Sophie',
  'ahmet@example.com': 'emma@example.com',
  'Atatürk Cad. No:1 İstanbul': '1 Market Street, San Francisco, CA',
  '+90 532 111 22 33': '+1 (202) 555-0111',
  '0212 444 55 66': '+1 (202) 555-0112',
  '+90 555 999 88 77': '+1 (202) 555-0113',
  // Notlar
  Notlar: 'Notes',
  'En eski not': 'Packing list',
  'eski önizleme': 'Passport, charger, sunglasses',
  'Orta not': 'Book recommendations',
  'orta önizleme': 'Project Hail Mary, Dune, The Martian',
  'En yeni not': 'Meeting notes',
  'yeni önizleme': 'Q3 roadmap review and next steps',
  'Silinmiş (Recently Deleted)': 'Old draft',
  silindi: 'deleted',
  'Silinmiş (ZMARKEDFORDELETION)': 'Scratchpad',
  işaretli: 'marked for deletion',
  // Ses kayıtları
  'İlk kayıt': 'Lecture recap',
};

/** Not başlığı (çevrilmiş) → gövde. */
const NOTE_BODIES: Record<string, string> = {
  'Packing list': 'Packing list\nPassport, charger, sunglasses, adapter',
  'Book recommendations': 'Book recommendations\nProject Hail Mary, Dune, The Martian',
  'Meeting notes':
    'Meeting notes\nQ3 roadmap review and next steps. Follow up with design on the new onboarding flow.',
  'Old draft': 'Old draft\nThis note is in Recently Deleted',
  Scratchpad: 'Scratchpad\nThis note is marked for deletion',
};

function mapNumbers(s: string): string {
  let out = s;
  for (const [from, to] of NUMBER_MAP) out = out.split(from).join(to);
  return out;
}

function mapText(v: string): string {
  return TEXT_MAP[v] ?? mapNumbers(v);
}

/** Bir DB'deki tüm TEXT (ve UTF-8 metin taşıyan BLOB) hücrelerini çevirir. */
function localizeDb(abs: string): void {
  const db = new Database(abs);
  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ name: string }>;
    for (const { name } of tables) {
      const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>;
      const rows = db.prepare(`SELECT rowid AS __rid, * FROM "${name}"`).all() as Array<
        Record<string, unknown>
      >;
      for (const row of rows) {
        for (const { name: col } of cols) {
          const v = row[col];
          let next: unknown = v;
          if (typeof v === 'string') next = mapText(v);
          else if (Buffer.isBuffer(v) && v.length <= 64) {
            // Arama geçmişi ZADDRESS gibi kısa UTF-8 BLOB'lar (gzip/protobuf'a dokunma).
            const s = v.toString('utf8');
            if (/^[+\d@.a-z]+$/i.test(s)) {
              const m = mapNumbers(s);
              if (m !== s) next = Buffer.from(m, 'utf8');
            }
          }
          if (next !== v) {
            db.prepare(`UPDATE "${name}" SET "${col}" = ? WHERE rowid = ?`).run(next, row.__rid);
          }
        }
      }
    }
  } finally {
    db.close();
  }
}

/** Notlar: başlıklar localizeDb'de çevrildi; sıkıştırılmış gövdeleri (ZDATA) yeniden üret. */
function rewriteNoteBodies(abs: string): void {
  const db = new Database(abs);
  try {
    const notes = db
      .prepare(
        `SELECT ZTITLE1 AS title, ZNOTEDATA AS dataPk FROM ZICCLOUDSYNCINGOBJECT
                WHERE ZNOTEDATA IS NOT NULL`,
      )
      .all() as Array<{ title: string; dataPk: number }>;
    const upd = db.prepare(`UPDATE ZICNOTEDATA SET ZDATA = ? WHERE Z_PK = ?`);
    for (const n of notes) {
      const body = NOTE_BODIES[n.title];
      if (body) upd.run(buildNoteZdata(body), n.dataPk);
    }
  } finally {
    db.close();
  }
}

const DBS: Array<[string, string]> = [
  ['HomeDomain', 'Library/SMS/sms.db'],
  ['HomeDomain', 'Library/AddressBook/AddressBook.sqlitedb'],
  ['HomeDomain', 'Library/CallHistoryDB/CallHistory.storedata'],
  ['HomeDomain', 'Library/Voicemail/voicemail.db'],
  ['AppDomainGroup-group.com.apple.notes', 'NoteStore.sqlite'],
  ['AppDomainGroup-group.com.apple.VoiceMemos.shared', 'Recordings/CloudRecordings.db'],
  ['AppDomainGroup-group.net.whatsapp.WhatsApp.shared', 'ChatStorage.sqlite'],
];

/** `<root>/<udid>` altındaki demo DB'lerini İngilizce içeriğe çevirir. */
export function localizeDemoBackup(rootPath: string, udid: string): void {
  for (const [domain, rel] of DBS) {
    const id = computeFileId(domain, rel);
    const abs = path.join(rootPath, udid, id.slice(0, 2), id);
    if (!fs.existsSync(abs)) continue;
    localizeDb(abs);
    if (rel === 'NoteStore.sqlite') rewriteNoteBodies(abs);
  }
}
