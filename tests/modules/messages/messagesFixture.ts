import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

// Apple nanosecond epoch — 2026-05-09 civarı (gerçek-veri ham örnek 800010409096004000)
export const NS_A = 800010409096004000n; // en eski
export const NS_B = 800010509096004000n;
export const NS_C = 800010609096004000n; // en yeni

/**
 * Sentetik sms.db fixture'ı doğru fileId konumuna yazar.
 * Tablolar: chat, message, handle, attachment, chat_message_join,
 *           chat_handle_join, message_attachment_join.
 */
export function writeSmsFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId('HomeDomain', 'Library/SMS/sms.db');
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, service TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, display_name TEXT, service_name TEXT);
    CREATE TABLE message (
      ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, service TEXT, is_from_me INTEGER,
      date INTEGER, handle_id INTEGER
    );
    CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, filename TEXT, mime_type TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
    CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
    CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
  `);

  // handles
  db.prepare(`INSERT INTO handle (ROWID, id, service) VALUES (?,?,?)`).run(
    1,
    '+905551234567',
    'iMessage',
  );
  db.prepare(`INSERT INTO handle (ROWID, id, service) VALUES (?,?,?)`).run(
    2,
    '+905001112233',
    'SMS',
  );

  // chat 1: display_name NULL → chat_identifier fallback, iMessage baskın
  db.prepare(`INSERT INTO chat (ROWID, chat_identifier, display_name) VALUES (?,?,?)`).run(
    10,
    '+905551234567',
    null,
  );
  // chat 2: SMS, display_name NULL
  db.prepare(`INSERT INTO chat (ROWID, chat_identifier, display_name) VALUES (?,?,?)`).run(
    20,
    '+905001112233',
    null,
  );
  // chat 3: hiç mesajı yok → elenmeli
  db.prepare(`INSERT INTO chat (ROWID, chat_identifier, display_name) VALUES (?,?,?)`).run(
    30,
    'tkgm sistem',
    null,
  );

  const insMsg = db.prepare(
    `INSERT INTO message (ROWID, text, service, is_from_me, date, handle_id) VALUES (?,?,?,?,?,?)`,
  );
  // chat 1 — iMessage thread (gelen + giden)
  insMsg.run(100, 'Merhaba', 'iMessage', 0, NS_A, 1); // gelen
  insMsg.run(101, 'Selam nasilsin', 'iMessage', 1, NS_B, null); // giden
  insMsg.run(102, 'Iyiyim tesekkurler', 'iMessage', 0, NS_C, 1); // gelen (en yeni)
  // chat 2 — SMS thread, içinde 1 iMessage (karışık ama SMS baskın)
  insMsg.run(200, 'Kod: 1234', 'SMS', 0, NS_A, 2);
  insMsg.run(201, 'Tamam', 'SMS', 1, NS_B, null);

  const insCMJ = db.prepare(`INSERT INTO chat_message_join (chat_id, message_id) VALUES (?,?)`);
  insCMJ.run(10, 100);
  insCMJ.run(10, 101);
  insCMJ.run(10, 102);
  insCMJ.run(20, 200);
  insCMJ.run(20, 201);

  // attachment on message 102 (gelen foto)
  db.prepare(`INSERT INTO attachment (ROWID, filename, mime_type) VALUES (?,?,?)`).run(
    1,
    '~/Library/SMS/Attachments/aa/bb/UUID/IMG_0001.HEIC',
    'image/heic',
  );
  db.prepare(`INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (?,?)`).run(
    102,
    1,
  );

  db.close();
}

/** AddressBook fixture — ABPerson + ABMultiValue (property=3 telefon). */
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
  // AB numara formatı handle'dan FARKLI (ülke kodu yok, parantez/boşluk var)
  db.prepare(`INSERT INTO ABMultiValue (record_id, property, value) VALUES (?,?,?)`).run(
    1,
    3,
    '(555) 123 45 67',
  );
  db.close();
}
