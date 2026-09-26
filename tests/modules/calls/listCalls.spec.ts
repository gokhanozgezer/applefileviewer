import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { listCalls } from '@main/modules/calls/listCalls';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { computeFileId } from '@main/modules/manifest/fileId';
import { getTmpRoot } from '../../setup';
import { writeCallsFixture, writeAddressBookFixture } from './callsFixture';

describe('listCalls', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeCallsFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('4 arama, tarih DESC (en yeni ilk)', async () => {
    const res = await listCalls({ udid, rootPath });
    expect(res.length).toBe(4);
    expect(res[0]!.id).toBe(12); // SEC_C en yeni
    expect(res[res.length - 1]!.id).toBe(10); // SEC_A en eski
  });

  it('ZDATE → appleSecondsToDate (SANİYE, 2017)', async () => {
    const res = await listCalls({ udid, rootPath });
    expect(res[res.length - 1]!.dateIso).toMatch(/^2017-/);
  });

  it('yön — ZORIGINATED (giden/gelen)', async () => {
    const res = await listCalls({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(10)!.direction).toBe('incoming');
    expect(byId.get(11)!.direction).toBe('outgoing');
    expect(byId.get(13)!.direction).toBe('outgoing');
  });

  it('missed — ZANSWERED===0 → isMissed true', async () => {
    const res = await listCalls({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(12)!.isMissed).toBe(true); // ZANSWERED=0
    expect(byId.get(10)!.isMissed).toBe(false); // ZANSWERED=1
  });

  it('callType — ZCALLTYPE (phone/facetime-video/facetime-audio)', async () => {
    const res = await listCalls({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(10)!.callType).toBe('phone'); // 1
    expect(byId.get(12)!.callType).toBe('facetime-video'); // 8
    expect(byId.get(13)!.callType).toBe('facetime-audio'); // 16
  });

  it('ZADDRESS BLOB → numara + ZDURATION', async () => {
    const res = await listCalls({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(10)!.number).toBe('+905551234567'); // BLOB decode
    expect(byId.get(10)!.durationSec).toBe(125);
    expect(byId.get(11)!.number).toBe('+905001112233'); // TEXT
  });

  it('AddressBook kişi adı (son-9-hane eşleşme)', async () => {
    const res = await listCalls({ udid, rootPath });
    const byId = new Map(res.map((c) => [c.id, c]));
    expect(byId.get(10)!.contactName).toBe('Ahmet Yilmaz');
    expect(byId.get(11)!.contactName).toBeNull(); // AB'de yok → numara fallback
  });

  it('EMPTY — CallHistory.storedata yoksa []', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listCalls({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — ZCALLRECORD tablosu yoksa [] (try/catch graceful)', async () => {
    const noTableUdid = 'c'.repeat(40);
    const backupDir = path.join(rootPath, noTableUdid);
    const fileId = computeFileId('HomeDomain', 'Library/CallHistoryDB/CallHistory.storedata');
    const dir = path.join(backupDir, fileId.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    // ZCALLRECORD olmayan bir db — başka bir tablo var
    const db = new Database(path.join(dir, fileId));
    db.exec(`CREATE TABLE Z_METADATA (Z_VERSION INTEGER);`);
    db.close();

    const res = await listCalls({ udid: noTableUdid, rootPath });
    expect(res).toEqual([]);
  });
});
