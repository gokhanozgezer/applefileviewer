import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { listVoiceMemos } from '@main/modules/voicememos/listVoiceMemos';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import { computeFileId } from '@main/modules/manifest/fileId';
import { getTmpRoot } from '../../setup';
import {
  writeVoiceMemosFixture,
  writeEmptyVoiceMemosFixture,
  APPLE_A,
  APPLE_C,
} from './voiceMemosFixture';

const VOICEMEMOS_DOMAIN = 'AppDomainGroup-group.com.apple.VoiceMemos.shared';

describe('listVoiceMemos', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeVoiceMemosFixture(rootPath, udid);
  });

  it('ZCLOUDRECORDING (ZRECORDING DEĞİL) → 3 kayıt, ZDATE DESC (en yeni ilk)', async () => {
    const res = await listVoiceMemos({ udid, rootPath });
    expect(res.length).toBe(3); // ZRECORDING boş — yanlış tablo seçilseydi 0 olurdu
    expect(res[0]!.id).toBe(3); // APPLE_C en yeni
    expect(res[res.length - 1]!.id).toBe(1); // APPLE_A en eski
  });

  it('tarih ZDATE saniye-FLOAT → appleSecondsToDate → ISO', async () => {
    const res = await listVoiceMemos({ udid, rootPath });
    const oldest = res[res.length - 1]!; // pk 1
    expect(oldest.dateIso).toBe(appleSecondsToDate(APPLE_A).toISOString());
    const newest = res[0]!; // pk 3 — gerçek-veri ham örneği 2024-05-03
    expect(newest.dateIso).toBe(appleSecondsToDate(APPLE_C).toISOString());
    expect(newest.dateIso!.startsWith('2024-05-03')).toBe(true);
  });

  it("fileId = computeFileId(VoiceMemos.shared, 'Recordings/' + ZPATH)", async () => {
    const res = await listVoiceMemos({ udid, rootPath });
    const newest = res[0]!; // pk 3, ZPATH "20240503 124237.m4a"
    expect(newest.fileId).toBe(computeFileId(VOICEMEMOS_DOMAIN, 'Recordings/20240503 124237.m4a'));
  });

  it('title = ZCUSTOMLABEL (doluysa)', async () => {
    const res = await listVoiceMemos({ udid, rootPath });
    const byId = new Map(res.map((m) => [m.id, m]));
    expect(byId.get(1)!.title).toBe('İlk kayıt');
  });

  it('title fallback — ZCUSTOMLABEL boş/null → ZPATH dosya adı (uzantısız)', async () => {
    const res = await listVoiceMemos({ udid, rootPath });
    const byId = new Map(res.map((m) => [m.id, m]));
    expect(byId.get(2)!.title).toBe('20240301 153000'); // ZCUSTOMLABEL ''
    expect(byId.get(3)!.title).toBe('20240503 124237'); // ZCUSTOMLABEL null
  });

  it('durationSec = round(ZDURATION saniye-FLOAT)', async () => {
    const res = await listVoiceMemos({ udid, rootPath });
    const byId = new Map(res.map((m) => [m.id, m]));
    expect(byId.get(1)!.durationSec).toBe(12); // 12.4
    expect(byId.get(2)!.durationSec).toBe(64); // 63.9
  });

  it('EMPTY — CloudRecordings.db yoksa []', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listVoiceMemos({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — ZCLOUDRECORDING var ama 0 kayıt → []', async () => {
    const emptyTableUdid = 'c'.repeat(40);
    writeEmptyVoiceMemosFixture(rootPath, emptyTableUdid);
    const res = await listVoiceMemos({ udid: emptyTableUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — ZCLOUDRECORDING tablosu yoksa [] (try/catch graceful)', async () => {
    const noTableUdid = 'd'.repeat(40);
    const backupDir = path.join(rootPath, noTableUdid);
    const fileId = computeFileId(VOICEMEMOS_DOMAIN, 'Recordings/CloudRecordings.db');
    const dir = path.join(backupDir, fileId.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, fileId));
    db.exec(`CREATE TABLE other (x INTEGER);`);
    db.close();

    const res = await listVoiceMemos({ udid: noTableUdid, rootPath });
    expect(res).toEqual([]);
  });
});
