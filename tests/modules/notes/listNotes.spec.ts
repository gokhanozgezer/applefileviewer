import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { listNotes } from '@main/modules/notes/listNotes';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import { computeFileId } from '@main/modules/manifest/fileId';
import { getTmpRoot } from '../../setup';
import { writeNotesFixture, writeEmptyNotesFixture, APPLE_A, APPLE_C } from './notesFixture';

describe('listNotes', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeNotesFixture(rootPath, udid);
  });

  it('3 not (silinmiş hariç), ZMODIFICATIONDATE DESC (en yeni ilk)', async () => {
    const res = await listNotes({ udid, rootPath });
    expect(res.length).toBe(3); // pk 4 (Recently Deleted) + pk 5 (marked) hariç
    expect(res[0]!.id).toBe(3); // APPLE_C en yeni
    expect(res[res.length - 1]!.id).toBe(1); // APPLE_A en eski
  });

  it('title (ZTITLE1) + snippet (ZSNIPPET)', async () => {
    const res = await listNotes({ udid, rootPath });
    const byId = new Map(res.map((n) => [n.id, n]));
    expect(byId.get(1)!.title).toBe('En eski not');
    expect(byId.get(1)!.snippet).toBe('eski önizleme');
  });

  it('body = decodeNoteBody(ZDATA) gzip+protobuf → düz metin', async () => {
    const res = await listNotes({ udid, rootPath });
    const byId = new Map(res.map((n) => [n.id, n]));
    expect(byId.get(1)!.body).toBe('~Bilgiler~\nyesil ic 1.4-1.6');
    expect(byId.get(2)!.body).toBe('orta notun gövdesi — Türkçe karakter: ğüşıöç');
  });

  it('tarihler Apple epoch SANİYE → appleSecondsToDate → ISO', async () => {
    const res = await listNotes({ udid, rootPath });
    const oldest = res[res.length - 1]!; // pk 1
    expect(oldest.createdIso).toBe(appleSecondsToDate(APPLE_A).toISOString());
    expect(oldest.modifiedIso).toBe(appleSecondsToDate(APPLE_A).toISOString());
    const newest = res[0]!; // pk 3
    expect(newest.modifiedIso).toBe(appleSecondsToDate(APPLE_C).toISOString());
  });

  it('folder adı (ZFOLDER → ZTITLE2) + klasörsüz null', async () => {
    const res = await listNotes({ udid, rootPath });
    const byId = new Map(res.map((n) => [n.id, n]));
    expect(byId.get(1)!.folderName).toBe('Notlar');
    expect(byId.get(3)!.folderName).toBeNull(); // ZFOLDER null
  });

  it('silinmiş notlar hariç (Recently Deleted folder + ZMARKEDFORDELETION)', async () => {
    const res = await listNotes({ udid, rootPath });
    expect(res.find((n) => n.id === 4)).toBeUndefined(); // Recently Deleted
    expect(res.find((n) => n.id === 5)).toBeUndefined(); // ZMARKEDFORDELETION=1
  });

  it('EMPTY — NoteStore.sqlite yoksa []', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listNotes({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — şema var ama 0 not → []', async () => {
    const emptyTableUdid = 'c'.repeat(40);
    writeEmptyNotesFixture(rootPath, emptyTableUdid);
    const res = await listNotes({ udid: emptyTableUdid, rootPath });
    expect(res).toEqual([]);
  });

  it('EMPTY — beklenen tablolar yoksa [] (try/catch graceful)', async () => {
    const noTableUdid = 'd'.repeat(40);
    const backupDir = path.join(rootPath, noTableUdid);
    const fileId = computeFileId('AppDomainGroup-group.com.apple.notes', 'NoteStore.sqlite');
    const dir = path.join(backupDir, fileId.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, fileId));
    db.exec(`CREATE TABLE other (x INTEGER);`);
    db.close();

    const res = await listNotes({ udid: noTableUdid, rootPath });
    expect(res).toEqual([]);
  });
});
