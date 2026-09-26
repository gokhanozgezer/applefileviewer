// Global arama testleri için ek sentetik fixture'lar — mevcut domain fixture'larının
// üstüne arama senaryolarına özgü satırlar ekler (attributedBody, Türkçe adlar,
// orijinal foto dosya adı…).
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

function fixturePath(rootPath: string, udid: string, domain: string, rel: string): string {
  const fileId = computeFileId(domain, rel);
  const dir = path.join(rootPath, udid, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fileId);
}

/** streamtyped NSAttributedString sentetik buffer (attributedBody.spec ile aynı düzen). */
export function buildStreamtyped(text: string): Buffer {
  const utf8 = Buffer.from(text, 'utf8');
  let lenBytes: Buffer;
  if (utf8.length < 0x80) {
    lenBytes = Buffer.from([0x2b, utf8.length]);
  } else {
    const b = Buffer.alloc(4);
    b[0] = 0x2b;
    b[1] = 0x81;
    b.writeUInt16LE(utf8.length, 2);
    lenBytes = b;
  }
  return Buffer.concat([
    Buffer.from('\x04\x0bstreamtyped'),
    Buffer.from('NSMutableAttributedString NSString '),
    lenBytes,
    utf8,
  ]);
}

/**
 * writeSmsFixture sonrası çağrılır: text NULL + attributedBody dolu mesaj (iOS 16+)
 * ve Türkçe büyük harfli bir text mesajı ekler (chat 10).
 */
export function addSearchMessages(rootPath: string, udid: string): void {
  const db = new Database(fixturePath(rootPath, udid, 'HomeDomain', 'Library/SMS/sms.db'));
  const ins = db.prepare(
    `INSERT INTO message (ROWID, text, attributedBody, service, is_from_me, date, handle_id)
     VALUES (?,?,?,?,?,?,?)`,
  );
  ins.run(
    300,
    null,
    buildStreamtyped('Yarın ŞİRKET toplantısı saat onda'),
    'iMessage',
    0,
    800010709096004000n,
    1,
  );
  ins.run(301, 'IŞIK kapalı kalsın', null, 'iMessage', 1, 800010809096004000n, null);
  db.prepare(`INSERT INTO chat_message_join (chat_id, message_id) VALUES (?,?)`).run(10, 300);
  db.prepare(`INSERT INTO chat_message_join (chat_id, message_id) VALUES (?,?)`).run(10, 301);
  db.close();
}

/** writeAddressBookFixture sonrası: Türkçe adlı + e-postalı kişi. */
export function addSearchContacts(rootPath: string, udid: string): void {
  const db = new Database(
    fixturePath(rootPath, udid, 'HomeDomain', 'Library/AddressBook/AddressBook.sqlitedb'),
  );
  db.prepare(`INSERT INTO ABPerson (ROWID, First, Last, Organization) VALUES (?,?,?,?)`).run(
    2,
    'Şule',
    'Güneş',
    'Işıklar A.Ş.',
  );
  db.prepare(`INSERT INTO ABMultiValue (record_id, property, value) VALUES (?,?,?)`).run(
    2,
    4,
    'sule@example.com',
  );
  db.close();
}

/** Photos.sqlite: ZASSET + ZADDITIONALASSETATTRIBUTES (orijinal dosya adı). */
export function writeSearchPhotosFixture(rootPath: string, udid: string): void {
  const db = new Database(
    fixturePath(rootPath, udid, 'CameraRollDomain', 'Media/PhotoData/Photos.sqlite'),
  );
  db.exec(`
    CREATE TABLE ZASSET (
      Z_PK INTEGER PRIMARY KEY, ZDIRECTORY TEXT, ZFILENAME TEXT, ZDATECREATED REAL,
      ZTRASHEDSTATE INTEGER
    );
    CREATE TABLE ZADDITIONALASSETATTRIBUTES (
      Z_PK INTEGER PRIMARY KEY, ZASSET INTEGER, ZORIGINALFILENAME TEXT
    );
  `);
  const ins = db.prepare(
    `INSERT INTO ZASSET (Z_PK, ZDIRECTORY, ZFILENAME, ZDATECREATED, ZTRASHEDSTATE) VALUES (?,?,?,?,?)`,
  );
  ins.run(1, 'DCIM/100APPLE', 'IMG_0001.HEIC', 799850629, 0);
  ins.run(2, 'DCIM/100APPLE', 'IMG_0002.JPG', 799850700, 0);
  ins.run(3, 'DCIM/100APPLE', 'IMG_0003.JPG', 799850800, 1); // çöpte → hariç
  const attr = db.prepare(
    `INSERT INTO ZADDITIONALASSETATTRIBUTES (ZASSET, ZORIGINALFILENAME) VALUES (?,?)`,
  );
  attr.run(1, 'Tatil_Çeşme.HEIC');
  attr.run(3, 'Tatil_Çöp.JPG');
  db.close();
}

/** Şeması bozuk CallHistory (ZCALLRECORD yok) — domain hata bayrağı senaryosu. */
export function writeBrokenCallsFixture(rootPath: string, udid: string): void {
  const db = new Database(
    fixturePath(rootPath, udid, 'HomeDomain', 'Library/CallHistoryDB/CallHistory.storedata'),
  );
  db.exec(`CREATE TABLE SOMETHING_ELSE (id INTEGER);`);
  db.close();
}
