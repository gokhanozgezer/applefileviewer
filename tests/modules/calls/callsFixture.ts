import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

// Apple Core Data SANİYE epoch — 2017 mertebesi (gerçek-veri büyüklüğüyle aynı).
export const SEC_A = 505000000; // en eski → 2017-01-01 UTC
export const SEC_B = 505000100;
export const SEC_C = 505000200; // en yeni

const HOME_REL = 'Library/CallHistoryDB/CallHistory.storedata';

/**
 * Sentetik CallHistory.storedata fixture'ı HomeDomain konumuna yazar.
 * Tablo: ZCALLRECORD (ZDATE saniye, ZDURATION, ZADDRESS BLOB, ZORIGINATED,
 * ZANSWERED, ZCALLTYPE).
 */
export function writeCallsFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId('HomeDomain', HOME_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ZCALLRECORD (
      Z_PK INTEGER PRIMARY KEY,
      ZDATE INTEGER,
      ZDURATION INTEGER,
      ZADDRESS BLOB,
      ZORIGINATED INTEGER,
      ZANSWERED INTEGER,
      ZCALLTYPE INTEGER
    );
  `);

  const ins = db.prepare(
    `INSERT INTO ZCALLRECORD (Z_PK, ZDATE, ZDURATION, ZADDRESS, ZORIGINATED, ZANSWERED, ZCALLTYPE)
     VALUES (?,?,?,?,?,?,?)`,
  );

  // 10 — gelen, cevaplanmış telefon, ZADDRESS BLOB (en eski)
  ins.run(10, SEC_A, 125, Buffer.from('+905551234567', 'utf8'), 0, 1, 1);
  // 11 — giden, cevaplanmış telefon, ZADDRESS TEXT
  ins.run(11, SEC_B, 42, '+905001112233', 1, 1, 1);
  // 12 — gelen CEVAPSIZ (ZANSWERED=0), FaceTime video (en yeni)
  ins.run(12, SEC_C, 0, Buffer.from('+905551234567', 'utf8'), 0, 0, 8);
  // 13 — giden FaceTime audio, cevaplanmış
  ins.run(13, SEC_B, 305, '+905999998877', 1, 1, 16);

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
