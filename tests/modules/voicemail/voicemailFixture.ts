import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

// UNIX epoch SANİYE (1970 tabanı) — Apple epoch DEĞİL! new Date(date*1000).
export const UNIX_A = 1_600_000_000; // 2020-09-13 UTC (en eski)
export const UNIX_B = 1_600_000_100;
export const UNIX_C = 1_600_000_200; // en yeni

const VOICEMAIL_REL = 'Library/Voicemail/voicemail.db';

/**
 * Klasik SQLite voicemail.db fixture'ı HomeDomain konumuna yazar.
 * Tablo: voicemail (ROWID, date UNIX saniye, sender, callback_num, duration,
 * trashed_date, flags, label, uuid).
 */
export function writeVoicemailFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId('HomeDomain', VOICEMAIL_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE voicemail (
      ROWID INTEGER PRIMARY KEY,
      date INTEGER,
      sender TEXT,
      callback_num TEXT,
      duration INTEGER,
      trashed_date INTEGER,
      flags INTEGER,
      label TEXT,
      uuid TEXT
    );
  `);

  const ins = db.prepare(
    `INSERT INTO voicemail (ROWID, date, sender, callback_num, duration, trashed_date, flags, uuid)
     VALUES (?,?,?,?,?,?,?,?)`,
  );

  // 10 — en eski, dinlenmiş (flags 0), AddressBook'ta kişi var
  ins.run(10, UNIX_A, '+905551234567', '+905551234567', 30, null, 0, 'uuid-10');
  // 11 — dinlenmemiş (flags & 1), AB'de yok → numara fallback
  ins.run(11, UNIX_B, '+905001112233', '+905001112233', 12, null, 1, 'uuid-11');
  // 12 — en yeni, dinlenmiş
  ins.run(12, UNIX_C, '+905999998877', '+905999998877', 95, null, 0, 'uuid-12');
  // 99 — SİLİNMİŞ (trashed_date dolu) → liste DIŞI
  ins.run(99, UNIX_C, '+905111111111', '+905111111111', 5, UNIX_C + 10, 0, 'uuid-99');

  db.close();
}

/** AddressBook fixture — +905551234567 için kişi adı (son-9-hane eşleşme). */
export function writeAddressBookFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId('HomeDomain', 'Library/AddressBook/AddressBook.sqlitedb');
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ABPerson (ROWID INTEGER PRIMARY KEY, First TEXT, Last TEXT, Organization TEXT);
    CREATE TABLE ABMultiValue (ROWID INTEGER PRIMARY KEY, record_id INTEGER, property INTEGER, value TEXT);
  `);
  db.prepare(`INSERT INTO ABPerson (ROWID, First, Last) VALUES (?,?,?)`).run(1, 'Ahmet', 'Yilmaz');
  db.prepare(`INSERT INTO ABMultiValue (record_id, property, value) VALUES (?,?,?)`).run(
    1,
    3,
    '(555) 123 45 67',
  );
  db.close();
}

/** Boş voicemail.db — tablo var ama 0 kayıt (gerçek-veri durumu). */
export function writeEmptyVoicemailFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId('HomeDomain', VOICEMAIL_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE voicemail (
      ROWID INTEGER PRIMARY KEY,
      date INTEGER,
      sender TEXT,
      callback_num TEXT,
      duration INTEGER,
      trashed_date INTEGER,
      flags INTEGER,
      label TEXT,
      uuid TEXT
    );
  `);
  db.close();
}
