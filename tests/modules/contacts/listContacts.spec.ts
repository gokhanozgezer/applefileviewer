import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { listContacts } from '@main/modules/contacts/listContacts';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import { computeFileId } from '@main/modules/manifest/fileId';
import { getTmpRoot } from '../../setup';
import { writeContactsFixture, writeEmptyContactsFixture, APPLE_BIRTHDAY } from './contactsFixture';

describe('listContacts', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeContactsFixture(rootPath, udid);
  });

  it('4 kişi döner', async () => {
    const res = await listContacts({ udid, rootPath });
    expect(res.length).toBe(4);
  });

  it('alfabetik sıra (FirstSort/First COLLATE NOCASE ASC)', async () => {
    const res = await listContacts({ udid, rootPath });
    // Beklenen: Acme A.Ş. (org, sort boş → First null) ... gerçekte sıralama
    // COALESCE(FirstSort, First, Organization, Nickname). Org "Acme" < "Ahmet" < "Berk" < "Zeynep".
    const names = res.map((c) => c.displayName);
    expect(names).toEqual(['Acme A.Ş.', 'Ahmet Yılmaz', 'Berk Demir', 'Zeynep']);
  });

  it('isim fallback: First+Last || Organization || Nickname', async () => {
    const res = await listContacts({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(1)!.displayName).toBe('Ahmet Yılmaz'); // First+Last
    expect(byId.get(3)!.displayName).toBe('Acme A.Ş.'); // Organization fallback
    expect(byId.get(4)!.displayName).toBe('Zeynep'); // Nickname fallback
  });

  it('telefon gruplama (ABMultiValue property 3)', async () => {
    const res = await listContacts({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(1)!.phones).toEqual(['+90 532 111 22 33', '0212 444 55 66']);
    expect(byId.get(2)!.phones).toEqual(['+90 555 999 88 77']);
    expect(byId.get(3)!.phones).toEqual([]); // telefonsuz
  });

  it('email gruplama (property 4)', async () => {
    const res = await listContacts({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(1)!.emails).toEqual(['ahmet@example.com']);
    expect(byId.get(2)!.emails).toEqual([]);
  });

  it('adres gruplama (property 5)', async () => {
    const res = await listContacts({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(3)!.addresses).toEqual(['Atatürk Cad. No:1 İstanbul']);
    expect(byId.get(1)!.addresses).toEqual([]);
  });

  it('organizasyon / jobTitle / note alanları', async () => {
    const res = await listContacts({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(1)!.jobTitle).toBe('Mühendis');
    expect(byId.get(1)!.note).toBe('iş arkadaşı');
    expect(byId.get(3)!.organization).toBe('Acme A.Ş.');
    expect(byId.get(2)!.jobTitle).toBeNull();
  });

  it('doğum günü Apple epoch SANİYE → ISO (yoksa null)', async () => {
    const res = await listContacts({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(1)!.birthdayIso).toBe(appleSecondsToDate(APPLE_BIRTHDAY).toISOString());
    expect(byId.get(2)!.birthdayIso).toBeNull();
  });

  it('EMPTY — AddressBook.sqlitedb yoksa []', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listContacts({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — şema var ama 0 kişi → []', async () => {
    const emptyTableUdid = 'c'.repeat(40);
    writeEmptyContactsFixture(rootPath, emptyTableUdid);
    const res = await listContacts({ udid: emptyTableUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — beklenen tablolar yoksa [] (try/catch graceful)', async () => {
    const noTableUdid = 'd'.repeat(40);
    const backupDir = path.join(rootPath, noTableUdid);
    const fileId = computeFileId('HomeDomain', 'Library/AddressBook/AddressBook.sqlitedb');
    const dir = path.join(backupDir, fileId.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, fileId));
    db.exec(`CREATE TABLE other (x INTEGER);`);
    db.close();

    const res = await listContacts({ udid: noTableUdid, rootPath });
    expect(res).toEqual([]);
  });
});
