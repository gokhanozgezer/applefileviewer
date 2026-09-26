import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { listVoicemails } from '@main/modules/voicemail/listVoicemails';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { computeFileId } from '@main/modules/manifest/fileId';
import { getTmpRoot } from '../../setup';
import {
  writeVoicemailFixture,
  writeAddressBookFixture,
  writeEmptyVoicemailFixture,
} from './voicemailFixture';

describe('listVoicemails', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeVoicemailFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('3 sesli mesaj (silinmiş hariç), tarih DESC (en yeni ilk)', async () => {
    const res = await listVoicemails({ udid, rootPath });
    expect(res.length).toBe(3); // 99 silinmiş → hariç
    expect(res[0]!.id).toBe(12); // UNIX_C en yeni
    expect(res[res.length - 1]!.id).toBe(10); // UNIX_A en eski
  });

  it('date → UNIX epoch SANİYE (new Date(date*1000), Apple DEĞİL → 2020)', async () => {
    const res = await listVoicemails({ udid, rootPath });
    const oldest = res[res.length - 1]!;
    // 1_600_000_000 * 1000 → 2020-09-13T12:26:40.000Z
    expect(oldest.dateIso).toBe(new Date(1_600_000_000 * 1000).toISOString());
    expect(oldest.dateIso).toMatch(/^2020-/);
  });

  it('trashed_date IS NULL filtresi — silinmiş (ROWID 99) hariç', async () => {
    const res = await listVoicemails({ udid, rootPath });
    expect(res.find((v) => v.id === 99)).toBeUndefined();
  });

  it('AddressBook kişi adı (son-9-hane eşleşme) + numara fallback', async () => {
    const res = await listVoicemails({ udid, rootPath });
    const byId = new Map(res.map((v) => [v.id, v]));
    expect(byId.get(10)!.contactName).toBe('Ahmet Yilmaz');
    expect(byId.get(11)!.contactName).toBeNull(); // AB'de yok
    expect(byId.get(11)!.sender).toBe('+905001112233');
  });

  it('isUnplayed — flags & 1', async () => {
    const res = await listVoicemails({ udid, rootPath });
    const byId = new Map(res.map((v) => [v.id, v]));
    expect(byId.get(11)!.isUnplayed).toBe(true); // flags=1
    expect(byId.get(10)!.isUnplayed).toBe(false); // flags=0
  });

  it('duration + fileId (HomeDomain/Library/Voicemail/<ROWID>.amr)', async () => {
    const res = await listVoicemails({ udid, rootPath });
    const byId = new Map(res.map((v) => [v.id, v]));
    expect(byId.get(10)!.durationSec).toBe(30);
    expect(byId.get(10)!.fileId).toBe(computeFileId('HomeDomain', 'Library/Voicemail/10.amr'));
  });

  it('EMPTY — voicemail.db yoksa []', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listVoicemails({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — voicemail tablosu var ama 0 kayıt → [] (gerçek-veri durumu)', async () => {
    const emptyTableUdid = 'c'.repeat(40);
    writeEmptyVoicemailFixture(rootPath, emptyTableUdid);
    const res = await listVoicemails({ udid: emptyTableUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — voicemail tablosu yoksa [] (try/catch graceful)', async () => {
    const noTableUdid = 'd'.repeat(40);
    const backupDir = path.join(rootPath, noTableUdid);
    const fileId = computeFileId('HomeDomain', 'Library/Voicemail/voicemail.db');
    const dir = path.join(backupDir, fileId.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, fileId));
    db.exec(`CREATE TABLE other (x INTEGER);`);
    db.close();

    const res = await listVoicemails({ udid: noTableUdid, rootPath });
    expect(res).toEqual([]);
  });
});
