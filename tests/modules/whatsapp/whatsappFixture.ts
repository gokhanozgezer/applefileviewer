import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';
import { WA_DOMAIN } from '@main/modules/whatsapp/whatsappDb';

// Apple SANİYE epoch — gerçek-veri ham örnek mertebesi (504917481 ≈ 2017 başı).
// UTC sınırını net 2017'ye taşımak için 505000000 tabanı (gerçek-veri büyüklüğüyle aynı).
export const SEC_A = 505000000; // en eski → 2017-01-01 UTC
export const SEC_B = 505000100;
export const SEC_C = 505000200; // en yeni

/**
 * Sentetik ChatStorage.sqlite fixture'ı doğru fileId konumuna yazar.
 * Tablolar: ZWACHATSESSION, ZWAMESSAGE, ZWAMEDIAITEM, ZWAGROUPMEMBER.
 */
export function writeWhatsAppFixture(rootPath: string, udid: string): void {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId(WA_DOMAIN, 'ChatStorage.sqlite');
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileId);

  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ZWACHATSESSION (
      Z_PK INTEGER PRIMARY KEY, ZPARTNERNAME TEXT, ZCONTACTJID TEXT
    );
    CREATE TABLE ZWAMESSAGE (
      Z_PK INTEGER PRIMARY KEY, ZTEXT TEXT, ZMESSAGEDATE INTEGER,
      ZISFROMME INTEGER, ZFROMJID TEXT, ZPUSHNAME TEXT,
      ZMESSAGETYPE INTEGER, ZCHATSESSION INTEGER,
      ZMEDIAITEM INTEGER, ZGROUPMEMBER INTEGER
    );
    CREATE TABLE ZWAMEDIAITEM (Z_PK INTEGER PRIMARY KEY, ZMEDIALOCALPATH TEXT, ZXMPPTHUMBPATH TEXT, ZTITLE TEXT);
    CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZCONTACTNAME TEXT, ZMEMBERJID TEXT);
  `);

  // session 1: birebir sohbet, ZPARTNERNAME yok → numara/AB fallback
  db.prepare(`INSERT INTO ZWACHATSESSION (Z_PK, ZPARTNERNAME, ZCONTACTJID) VALUES (?,?,?)`).run(
    1,
    null,
    '905551234567@s.whatsapp.net',
  );
  // session 2: grup
  db.prepare(`INSERT INTO ZWACHATSESSION (Z_PK, ZPARTNERNAME, ZCONTACTJID) VALUES (?,?,?)`).run(
    2,
    'Aile Grubu',
    '905000000000-123@g.us',
  );
  // session 3: hiç mesaj yok → elenmeli
  db.prepare(`INSERT INTO ZWACHATSESSION (Z_PK, ZPARTNERNAME, ZCONTACTJID) VALUES (?,?,?)`).run(
    3,
    'Boş Sohbet',
    '905999999999@s.whatsapp.net',
  );

  // grup üyesi
  db.prepare(`INSERT INTO ZWAGROUPMEMBER (Z_PK, ZCONTACTNAME, ZMEMBERJID) VALUES (?,?,?)`).run(
    50,
    'Mehmet',
    '905111222333@s.whatsapp.net',
  );

  // medya item (session 1, mesaj 102'de foto) — Message/Media/ zaten var → korunur
  db.prepare(
    `INSERT INTO ZWAMEDIAITEM (Z_PK, ZMEDIALOCALPATH, ZXMPPTHUMBPATH, ZTITLE) VALUES (?,?,?,?)`,
  ).run(900, 'Message/Media/905551234567@s.whatsapp.net/3/9/UUID/IMG_0001.jpg', null, null);
  // BUG 1 — full media indirilmemiş (ZMEDIALOCALPATH NULL) ama XMPP thumbnail var.
  // ZXMPPTHUMBPATH `Media/...` formatı → fileId Message/ prefix ile çözülür.
  db.prepare(
    `INSERT INTO ZWAMEDIAITEM (Z_PK, ZMEDIALOCALPATH, ZXMPPTHUMBPATH, ZTITLE) VALUES (?,?,?,?)`,
  ).run(901, null, 'Media/905551234567@s.whatsapp.net/d/c/THUMB_UUID/IMG_THUMB.jpg', null);
  // BUG 1 — ikisi de NULL → hiç indirilmemiş → media null veya fileId null.
  db.prepare(
    `INSERT INTO ZWAMEDIAITEM (Z_PK, ZMEDIALOCALPATH, ZXMPPTHUMBPATH, ZTITLE) VALUES (?,?,?,?)`,
  ).run(902, null, null, null);

  const insMsg = db.prepare(
    `INSERT INTO ZWAMESSAGE
       (Z_PK, ZTEXT, ZMESSAGEDATE, ZISFROMME, ZFROMJID, ZPUSHNAME, ZMESSAGETYPE, ZCHATSESSION, ZMEDIAITEM, ZGROUPMEMBER)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  // session 1 — birebir (gelen + giden + medya)
  insMsg.run(100, 'Merhaba', SEC_A, 0, '905551234567@s.whatsapp.net', null, 0, 1, null, null);
  insMsg.run(101, 'Selam nasilsin', SEC_B, 1, null, null, 0, 1, null, null);
  insMsg.run(102, null, SEC_C, 0, '905551234567@s.whatsapp.net', null, 1, 1, 900, null);
  // 103 — full media yok, sadece XMPP thumbnail (indirilmemiş ama küçük resim var)
  insMsg.run(103, null, SEC_C, 0, '905551234567@s.whatsapp.net', null, 1, 1, 901, null);
  // 104 — ikisi de NULL (hiç indirilmemiş)
  insMsg.run(104, null, SEC_C, 0, '905551234567@s.whatsapp.net', null, 1, 1, 902, null);
  // session 2 — grup, gönderen adı (push name + group member)
  insMsg.run(
    200,
    'Grup mesaji',
    SEC_A,
    0,
    '905111222333@s.whatsapp.net',
    'Mehmet K.',
    0,
    2,
    null,
    50,
  );
  insMsg.run(201, 'Tamam', SEC_B, 1, null, null, 0, 2, null, null);

  db.close();
}

/** AddressBook fixture — session 1 partner'ı için kişi adı. */
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
