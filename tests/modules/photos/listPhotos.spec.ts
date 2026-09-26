import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { listPhotos } from '@main/modules/photos/listPhotos';
import { computeFileId } from '@main/modules/manifest/fileId';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { getTmpRoot } from '../../setup';

describe('listPhotos (ZASSET join)', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    const backupDir = path.join(rootPath, udid);
    fs.mkdirSync(backupDir, { recursive: true });

    // Photos.sqlite'ı doğru fileId konumuna yerleştir
    const photoFid = computeFileId('CameraRollDomain', 'Media/PhotoData/Photos.sqlite');
    const photoDir = path.join(backupDir, photoFid.slice(0, 2));
    fs.mkdirSync(photoDir, { recursive: true });
    const photoAbs = path.join(photoDir, photoFid);

    const db = new Database(photoAbs);
    db.exec(`
      CREATE TABLE ZASSET (
        Z_PK INTEGER PRIMARY KEY,
        ZDIRECTORY TEXT, ZFILENAME TEXT, ZDATECREATED REAL,
        ZFAVORITE INTEGER, ZHIDDEN INTEGER, ZKIND INTEGER, ZTRASHEDSTATE INTEGER,
        ZWIDTH INTEGER, ZHEIGHT INTEGER, ZDURATION REAL, ZUNIFORMTYPEIDENTIFIER TEXT
      );
    `);
    const ins = db.prepare(`INSERT INTO ZASSET
      (ZDIRECTORY, ZFILENAME, ZDATECREATED, ZFAVORITE, ZHIDDEN, ZKIND, ZTRASHEDSTATE, ZWIDTH, ZHEIGHT, ZDURATION, ZUNIFORMTYPEIDENTIFIER)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    // Foto (HEIC), favori
    ins.run(
      'DCIM/100APPLE',
      'IMG_0001.HEIC',
      799850629.028,
      1,
      0,
      0,
      0,
      4032,
      3024,
      null,
      'public.heic',
    );
    // Video (MOV)
    ins.run(
      'DCIM/100APPLE',
      'IMG_0002.MOV',
      799777697.133,
      0,
      0,
      1,
      0,
      1920,
      1080,
      12.5,
      'com.apple.quicktime-movie',
    );
    // Gizli foto
    ins.run(
      'DCIM/100APPLE',
      'IMG_0003.JPG',
      799700000,
      0,
      1,
      0,
      0,
      3024,
      4032,
      null,
      'public.jpeg',
    );
    // Çöp (ZTRASHEDSTATE=1) — listPhotos'tan ELENMELI
    ins.run(
      'DCIM/100APPLE',
      'IMG_0004.HEIC',
      799600000,
      0,
      0,
      0,
      1,
      4032,
      3024,
      null,
      'public.heic',
    );
    db.close();
  });

  it('ZASSET join — çöp hariç, ZDATECREATED DESC', async () => {
    const res = await listPhotos({ udid, rootPath });
    expect(res.total).toBe(3); // çöp (ZTRASHEDSTATE=1) elendi
    // En yeni önce (799850629 > 799777697 > 799700000)
    expect(res.items[0]!.filename).toBe('IMG_0001.HEIC');
    expect(res.items[2]!.filename).toBe('IMG_0003.JPG');
  });

  it('ZDATECREATED → appleSecondsToDate (FLOAT saniye, 2026)', async () => {
    const res = await listPhotos({ udid, rootPath });
    const first = res.items[0]!;
    expect(first.dateTakenIso).toBe('2026-05-07T12:43:49.028Z'); // 799850629.028 saniye
  });

  it('video ayrımı (ZKIND=1) + süre', async () => {
    const res = await listPhotos({ udid, rootPath });
    const video = res.items.find((i) => i.filename === 'IMG_0002.MOV');
    expect(video!.isVideo).toBe(true);
    expect(video!.durationSec).toBe(12.5);
    const photo = res.items.find((i) => i.filename === 'IMG_0001.HEIC');
    expect(photo!.isVideo).toBe(false);
  });

  it('favori + gizli flag', async () => {
    const res = await listPhotos({ udid, rootPath });
    expect(res.items.find((i) => i.filename === 'IMG_0001.HEIC')!.isFavorite).toBe(true);
    expect(res.items.find((i) => i.filename === 'IMG_0003.JPG')!.isHidden).toBe(true);
  });

  it('fileId hesabı (Media/ZDIRECTORY/ZFILENAME)', async () => {
    const res = await listPhotos({ udid, rootPath });
    const first = res.items[0]!;
    expect(first.relativePath).toBe('Media/DCIM/100APPLE/IMG_0001.HEIC');
    expect(first.fileId).toBe(
      computeFileId('CameraRollDomain', 'Media/DCIM/100APPLE/IMG_0001.HEIC'),
    );
    expect(first.ext).toBe('HEIC');
  });

  it('Photos.sqlite yoksa boş sonuç (crash değil)', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listPhotos({ udid: emptyUdid, rootPath });
    expect(res.total).toBe(0);
  });

  it('sayfalama: limit/offset sayfa döner, total filtre toplamı kalır', async () => {
    const page1 = await listPhotos({ udid, rootPath, offset: 0, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.offset).toBe(0);
    expect(page1.items[0]!.filename).toBe('IMG_0001.HEIC');

    const page2 = await listPhotos({ udid, rootPath, offset: 2, limit: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.filename).toBe('IMG_0003.JPG');
    expect(page2.offset).toBe(2);
  });

  it('server-side filtre: favoritesOnly', async () => {
    const res = await listPhotos({ udid, rootPath, favoritesOnly: true });
    expect(res.total).toBe(1);
    expect(res.items[0]!.filename).toBe('IMG_0001.HEIC');
  });

  it('server-side filtre: includeHidden=false gizliyi eler', async () => {
    const res = await listPhotos({ udid, rootPath, includeHidden: false });
    expect(res.total).toBe(2);
    expect(res.items.some((i) => i.isHidden)).toBe(false);
  });

  it('filtre + sayfalama birlikte tutarlı', async () => {
    const res = await listPhotos({ udid, rootPath, includeHidden: false, offset: 1, limit: 5 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.filename).toBe('IMG_0002.MOV');
  });
});
