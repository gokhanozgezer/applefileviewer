import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

const CONTACTS_DOMAIN = 'HomeDomain';
const CONTACTS_REL = 'Library/AddressBook/AddressBook.sqlitedb';

// Apple epoch SANİYE (2001-01-01 UTC tabanı). appleSecondsToDate ile çevrilir.
export const APPLE_BIRTHDAY = 600_000_000; // 2020-01-06 UTC civarı

interface PersonSpec {
  rowid: number;
  first: string | null;
  last: string | null;
  organization?: string | null;
  jobTitle?: string | null;
  nickname?: string | null;
  note?: string | null;
  birthday?: number | null;
  firstSort?: string | null;
  lastSort?: string | null;
}

interface MultiSpec {
  recordId: number;
  property: number; // 3=tel, 4=email, 5=adres
  value: string;
}

/**
 * Sentetik AddressBook.sqlitedb fixture'ı. ABPerson + ABMultiValue
 * (property 3=telefon, 4=email, 5=adres). Gerçek şema alt kümesini taklit eder.
 *
 * Kişiler (alfabetik beklenen sıra):
 *   - "Ahmet Yılmaz" (rowid 1) — 2 telefon, 1 email, doğum günü
 *   - "Berk Demir"   (rowid 2) — 1 telefon
 *   - "Acme A.Ş."    (rowid 3) — sadece organizasyon (isim fallback), 1 adres
 *   - "Zeynep" nick  (rowid 4) — First/Last/Org boş, Nickname fallback
 */
export function writeContactsFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId(CONTACTS_DOMAIN, CONTACTS_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ABPerson (
      ROWID INTEGER PRIMARY KEY,
      First TEXT, Last TEXT, Middle TEXT,
      Organization TEXT, Department TEXT, JobTitle TEXT,
      Nickname TEXT, Note TEXT, Birthday REAL,
      FirstSort TEXT, LastSort TEXT
    );
    CREATE TABLE ABMultiValue (
      UID INTEGER PRIMARY KEY,
      record_id INTEGER, property INTEGER, label INTEGER, value TEXT
    );
  `);

  const persons: PersonSpec[] = [
    {
      rowid: 1,
      first: 'Ahmet',
      last: 'Yılmaz',
      jobTitle: 'Mühendis',
      note: 'iş arkadaşı',
      birthday: APPLE_BIRTHDAY,
      firstSort: 'Ahmet',
      lastSort: 'Yılmaz',
    },
    { rowid: 2, first: 'Berk', last: 'Demir', firstSort: 'Berk', lastSort: 'Demir' },
    {
      rowid: 3,
      first: null,
      last: null,
      organization: 'Acme A.Ş.',
      firstSort: null,
      lastSort: null,
    },
    {
      rowid: 4,
      first: null,
      last: null,
      organization: null,
      nickname: 'Zeynep',
      firstSort: null,
      lastSort: null,
    },
  ];

  const insP = db.prepare(
    `INSERT INTO ABPerson
       (ROWID, First, Last, Organization, JobTitle, Nickname, Note, Birthday, FirstSort, LastSort)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const p of persons) {
    insP.run(
      p.rowid,
      p.first,
      p.last,
      p.organization ?? null,
      p.jobTitle ?? null,
      p.nickname ?? null,
      p.note ?? null,
      p.birthday ?? null,
      p.firstSort ?? null,
      p.lastSort ?? null,
    );
  }

  const multi: MultiSpec[] = [
    { recordId: 1, property: 3, value: '+90 532 111 22 33' }, // Ahmet tel 1
    { recordId: 1, property: 3, value: '0212 444 55 66' }, // Ahmet tel 2
    { recordId: 1, property: 4, value: 'ahmet@example.com' }, // Ahmet email
    { recordId: 2, property: 3, value: '+90 555 999 88 77' }, // Berk tel
    { recordId: 3, property: 5, value: 'Atatürk Cad. No:1 İstanbul' }, // Acme adres
  ];
  const insM = db.prepare(`INSERT INTO ABMultiValue (record_id, property, value) VALUES (?,?,?)`);
  for (const m of multi) insM.run(m.recordId, m.property, m.value);

  db.close();
}

/** Boş AddressBook — şema var ama 0 kişi. */
export function writeEmptyContactsFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId(CONTACTS_DOMAIN, CONTACTS_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ABPerson (
      ROWID INTEGER PRIMARY KEY, First TEXT, Last TEXT, Middle TEXT,
      Organization TEXT, Department TEXT, JobTitle TEXT, Nickname TEXT,
      Note TEXT, Birthday REAL, FirstSort TEXT, LastSort TEXT
    );
    CREATE TABLE ABMultiValue (
      UID INTEGER PRIMARY KEY, record_id INTEGER, property INTEGER, label INTEGER, value TEXT
    );
  `);
  db.close();
}
