import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

const NOTES_DOMAIN = 'AppDomainGroup-group.com.apple.notes';
const NOTES_REL = 'NoteStore.sqlite';

// Apple epoch SANİYE (2001-01-01 UTC tabanı). appleSecondsToDate ile çevrilir.
// 600_000_000 → 2020-01-06 UTC civarı.
export const APPLE_A = 600_000_000; // en eski
export const APPLE_B = 600_000_100;
export const APPLE_C = 600_000_200; // en yeni

// ── Manuel protobuf encoder (test-only) ─────────────────────────────────────

/** number → base-128 varint buffer. */
function varint(n: number): Buffer {
  const out: number[] = [];
  let v = n;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v & 0x7f);
  return Buffer.from(out);
}

/** field tag (fieldNum << 3 | wireType) — hepsi wire type 2 (length-delimited). */
function lenField(fieldNum: number, payload: Buffer): Buffer {
  const tag = varint(fieldNum * 8 + 2);
  return Buffer.concat([tag, varint(payload.length), payload]);
}

/**
 * Apple Notes proto yapısını elle kur: field 2 (document) → field 3 (note)
 * → field 2 (noteText string). Gerçek decode path'i bu zinciri yürür.
 */
export function buildNoteProto(noteText: string): Buffer {
  const noteText2 = lenField(2, Buffer.from(noteText, 'utf8')); // note.field2 = noteText
  const note3 = lenField(3, noteText2); // document.field3 = note
  const document2 = lenField(2, note3); // top.field2 = document
  return document2;
}

/** Gerçek-veri pipeline: protobuf → gzip (ZDATA bytes). */
export function buildNoteZdata(noteText: string): Buffer {
  return zlib.gzipSync(buildNoteProto(noteText));
}

/** varint alanı (wire type 0). */
function varintField(fieldNum: number, value: number): Buffer {
  return Buffer.concat([varint(fieldNum * 8 + 0), varint(value)]);
}

export interface FixtureRun {
  length: number;
  fontWeight?: number; // 1 bold, 2 italic, 3 bold+italic
  underline?: boolean;
  strikethrough?: boolean;
  styleType?: number; // 103 = checklist
  checklistDone?: boolean;
}

/**
 * Zengin biçimli not protosu: note(3) içine noteText(2) + repeated attributeRun(5).
 * attributeRun: length(1 varint), paragraphStyle(2: styleType(1) + todo(5: done(2))),
 * fontWeight(5 varint), underlined(6), strikethrough(7).
 */
export function buildRichNoteProto(noteText: string, runs: FixtureRun[]): Buffer {
  const parts: Buffer[] = [lenField(2, Buffer.from(noteText, 'utf8'))];
  for (const r of runs) {
    const runParts: Buffer[] = [varintField(1, r.length)];
    if (r.styleType != null) {
      const psParts: Buffer[] = [varintField(1, r.styleType)];
      if (r.checklistDone != null) {
        psParts.push(lenField(5, varintField(2, r.checklistDone ? 1 : 0)));
      }
      runParts.push(lenField(2, Buffer.concat(psParts)));
    }
    if (r.fontWeight != null) runParts.push(varintField(5, r.fontWeight));
    if (r.underline) runParts.push(varintField(6, 1));
    if (r.strikethrough) runParts.push(varintField(7, 1));
    parts.push(lenField(5, Buffer.concat(runParts)));
  }
  const note3 = lenField(3, Buffer.concat(parts));
  return lenField(2, note3);
}

interface NoteSpec {
  pk: number;
  title: string;
  snippet: string;
  body: string;
  created: number;
  modified: number;
  folderPk: number | null;
  markedForDeletion?: number;
}

/**
 * Sentetik NoteStore.sqlite fixture'ı. ZICCLOUDSYNCINGOBJECT (not + folder kayıtları)
 * + ZICNOTEDATA (gzip+protobuf ZDATA). Gerçek şema alt kümesini taklit eder.
 */
export function writeNotesFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId(NOTES_DOMAIN, NOTES_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ZICNOTEDATA (
      Z_PK INTEGER PRIMARY KEY,
      ZDATA BLOB
    );
    CREATE TABLE ZICCLOUDSYNCINGOBJECT (
      Z_PK INTEGER PRIMARY KEY,
      ZTITLE1 TEXT,             -- not başlığı
      ZTITLE2 TEXT,             -- klasör adı
      ZSNIPPET TEXT,
      ZCREATIONDATE REAL,
      ZMODIFICATIONDATE REAL,
      ZFOLDER INTEGER,
      ZNOTEDATA INTEGER,
      ZMARKEDFORDELETION INTEGER
    );
  `);

  // Folder kayıtları (ZICCLOUDSYNCINGOBJECT içinde, ZTITLE2 dolu)
  const insFolder = db.prepare(`INSERT INTO ZICCLOUDSYNCINGOBJECT (Z_PK, ZTITLE2) VALUES (?,?)`);
  insFolder.run(100, 'Notlar'); // normal klasör
  insFolder.run(101, 'Recently Deleted'); // silinenler klasörü

  const notes: NoteSpec[] = [
    {
      pk: 1,
      title: 'En eski not',
      snippet: 'eski önizleme',
      body: '~Bilgiler~\nyesil ic 1.4-1.6',
      created: APPLE_A,
      modified: APPLE_A,
      folderPk: 100,
    },
    {
      pk: 2,
      title: 'Orta not',
      snippet: 'orta önizleme',
      body: 'orta notun gövdesi — Türkçe karakter: ğüşıöç',
      created: APPLE_B,
      modified: APPLE_B,
      folderPk: 100,
    },
    {
      pk: 3,
      title: 'En yeni not',
      snippet: 'yeni önizleme',
      body: 'en yeni notun uzun gövdesi burada yer alir',
      created: APPLE_C,
      modified: APPLE_C,
      folderPk: null, // klasörsüz
    },
    {
      pk: 4,
      title: 'Silinmiş (Recently Deleted)',
      snippet: 'silindi',
      body: 'bu not silinenler klasöründe',
      created: APPLE_C,
      modified: APPLE_C,
      folderPk: 101, // Recently Deleted → liste dışı
    },
    {
      pk: 5,
      title: 'Silinmiş (ZMARKEDFORDELETION)',
      snippet: 'işaretli',
      body: 'bu not silinmek için işaretli',
      created: APPLE_C,
      modified: APPLE_C,
      folderPk: 100,
      markedForDeletion: 1, // → liste dışı
    },
  ];

  const insData = db.prepare(`INSERT INTO ZICNOTEDATA (Z_PK, ZDATA) VALUES (?,?)`);
  const insNote = db.prepare(
    `INSERT INTO ZICCLOUDSYNCINGOBJECT
       (Z_PK, ZTITLE1, ZSNIPPET, ZCREATIONDATE, ZMODIFICATIONDATE, ZFOLDER, ZNOTEDATA, ZMARKEDFORDELETION)
     VALUES (?,?,?,?,?,?,?,?)`,
  );

  for (const n of notes) {
    const dataPk = 500 + n.pk;
    insData.run(dataPk, buildNoteZdata(n.body));
    insNote.run(
      n.pk,
      n.title,
      n.snippet,
      n.created,
      n.modified,
      n.folderPk,
      dataPk,
      n.markedForDeletion ?? null,
    );
  }

  db.close();
}

/** Boş NoteStore — şema var ama 0 not (gerçek-veri empty durumu). */
export function writeEmptyNotesFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId(NOTES_DOMAIN, NOTES_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ZICNOTEDATA (Z_PK INTEGER PRIMARY KEY, ZDATA BLOB);
    CREATE TABLE ZICCLOUDSYNCINGOBJECT (
      Z_PK INTEGER PRIMARY KEY, ZTITLE1 TEXT, ZTITLE2 TEXT, ZSNIPPET TEXT,
      ZCREATIONDATE REAL, ZMODIFICATIONDATE REAL, ZFOLDER INTEGER,
      ZNOTEDATA INTEGER, ZMARKEDFORDELETION INTEGER
    );
  `);
  db.close();
}
