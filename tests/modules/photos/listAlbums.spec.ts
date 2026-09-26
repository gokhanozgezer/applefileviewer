import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { listAlbums } from '@main/modules/photos/listAlbums';
import { listPhotos } from '@main/modules/photos/listPhotos';
import { computeFileId } from '@main/modules/manifest/fileId';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { getTmpRoot } from '../../setup';

// Ara tablo adı iOS sürümüne göre değişir — iki farklı numaralandırma ile aynı sonuç beklenir.
const VARIANTS = [
  {
    label: 'iOS 14 (Z_26ASSETS)',
    table: 'Z_26ASSETS',
    albumCol: 'Z_26ALBUMS',
    assetCol: 'Z_3ASSETS',
  },
  {
    label: 'iOS 16 (Z_28ASSETS)',
    table: 'Z_28ASSETS',
    albumCol: 'Z_28ALBUMS',
    assetCol: 'Z_34ASSETS',
  },
];

function placeDb(rootPath: string, udid: string): string {
  const backupDir = path.join(rootPath, udid);
  const fid = computeFileId('CameraRollDomain', 'Media/PhotoData/Photos.sqlite');
  const dir = path.join(backupDir, fid.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fid);
}

describe.each(VARIANTS)('albümler — $label', ({ table, albumCol, assetCol }) => {
  let rootPath: string;
  const udid = 'c'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    const db = new Database(placeDb(rootPath, udid));
    db.exec(`
      CREATE TABLE ZASSET (
        Z_PK INTEGER PRIMARY KEY,
        ZDIRECTORY TEXT, ZFILENAME TEXT, ZDATECREATED REAL,
        ZFAVORITE INTEGER, ZHIDDEN INTEGER, ZKIND INTEGER, ZKINDSUBTYPE INTEGER,
        ZTRASHEDSTATE INTEGER, ZDERIVEDCAMERACAPTUREDEVICE INTEGER,
        ZWIDTH INTEGER, ZHEIGHT INTEGER, ZDURATION REAL, ZUNIFORMTYPEIDENTIFIER TEXT,
        ZLATITUDE REAL, ZLONGITUDE REAL
      );
      CREATE TABLE ZGENERICALBUM (
        Z_PK INTEGER PRIMARY KEY, ZKIND INTEGER, ZTITLE TEXT, ZTRASHEDSTATE INTEGER, ZCACHEDCOUNT INTEGER
      );
      CREATE TABLE ${table} (${albumCol} INTEGER, ${assetCol} INTEGER, Z_FOK_${assetCol.slice(2)} INTEGER);
      -- Tuzak: ALBUMS kolonu olmayan benzer adlı tablo seçilmemeli
      CREATE TABLE Z_40ASSETS (Z_40MOMENTS INTEGER, Z_3ASSETS INTEGER);
    `);
    const ins = db.prepare(`INSERT INTO ZASSET
      (Z_PK, ZDIRECTORY, ZFILENAME, ZDATECREATED, ZFAVORITE, ZHIDDEN, ZKIND, ZKINDSUBTYPE,
       ZTRASHEDSTATE, ZDERIVEDCAMERACAPTUREDEVICE, ZLATITUDE, ZLONGITUDE)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run(1, 'DCIM/100APPLE', 'IMG_0001.HEIC', 800000000, 0, 0, 0, 2, 0, 0, 41.0082, 28.9784); // live
    ins.run(2, 'DCIM/100APPLE', 'IMG_0002.PNG', 799000000, 0, 0, 0, 10, 0, 0, -180, -180); // screenshot
    ins.run(3, 'DCIM/100APPLE', 'IMG_0003.MOV', 798000000, 0, 0, 1, 0, 0, 1, null, null); // video, selfie
    ins.run(4, 'DCIM/100APPLE', 'IMG_0004.JPG', 797000000, 0, 1, 0, 0, 0, 0, null, null); // gizli
    ins.run(5, 'DCIM/100APPLE', 'IMG_0005.JPG', 796000000, 0, 0, 0, 0, 1, 0, null, null); // çöp
    const alb = db.prepare('INSERT INTO ZGENERICALBUM VALUES (?,?,?,?,?)');
    alb.run(10, 2, 'Tatil', 0, 99);
    alb.run(11, 2, 'Aile', 0, 0);
    alb.run(12, 4000, 'Klasör', 0, 0); // klasör — listelenmemeli
    alb.run(13, 2, 'Silinmiş albüm', 1, 0); // çöpte — listelenmemeli
    const link = db.prepare(`INSERT INTO ${table} (${albumCol}, ${assetCol}) VALUES (?, ?)`);
    link.run(10, 1);
    link.run(10, 3);
    link.run(10, 4); // gizli
    link.run(10, 5); // çöp
    link.run(11, 2);
    db.close();
  });

  it('kullanıcı albümleri: ZKIND=2, çöpteki albüm hariç, başlığa göre sıralı, sayılar filtreli', async () => {
    const albums = await listAlbums({ udid, rootPath, includeHidden: false });
    const user = albums.filter((a) => a.kind === 'user');
    expect(user.map((a) => a.title)).toEqual(['Aile', 'Tatil']);
    // Tatil: 1,3 (4 gizli, 5 çöp) → 2 — ZCACHEDCOUNT (99) kullanılmaz.
    expect(user.find((a) => a.title === 'Tatil')!.count).toBe(2);
    const withHidden = await listAlbums({ udid, rootPath, includeHidden: true });
    expect(withHidden.find((a) => a.title === 'Tatil')!.count).toBe(3);
  });

  it('akıllı albümler şema kolonlarından türetilir', async () => {
    const albums = await listAlbums({ udid, rootPath, includeHidden: false });
    const smart = Object.fromEntries(
      albums.filter((a) => a.kind === 'smart').map((a) => [a.smartKey, a.count]),
    );
    expect(smart).toEqual({
      videos: 1,
      livePhotos: 1,
      selfies: 1,
      screenshots: 1,
      recentlyDeleted: 1,
      // panoramas: 0 → listelenmez
    });
  });

  it('listPhotos albüm filtresi + sayfalama', async () => {
    const tatil = await listPhotos({ udid, rootPath, albumId: 'album:10', includeHidden: false });
    expect(tatil.total).toBe(2);
    expect(tatil.items.map((i) => i.filename)).toEqual(['IMG_0001.HEIC', 'IMG_0003.MOV']);

    const page = await listPhotos({ udid, rootPath, albumId: 'album:10', offset: 1, limit: 1 });
    expect(page.total).toBe(3); // gizli dahil (includeHidden verilmedi)
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.filename).toBe('IMG_0003.MOV');
  });

  it('akıllı albüm filtresi: Son Silinenler yalnızca çöpü, videolar ZKIND=1', async () => {
    const trash = await listPhotos({ udid, rootPath, albumId: 'smart:recentlyDeleted' });
    expect(trash.items.map((i) => i.filename)).toEqual(['IMG_0005.JPG']);
    const videos = await listPhotos({ udid, rootPath, albumId: 'smart:videos' });
    expect(videos.items.map((i) => i.filename)).toEqual(['IMG_0003.MOV']);
  });

  it('bilinmeyen albüm id → boş sonuç (crash değil)', async () => {
    const res = await listPhotos({ udid, rootPath, albumId: 'smart:nope' });
    expect(res.total).toBe(0);
    const res2 = await listPhotos({ udid, rootPath, albumId: 'garbage' });
    expect(res2.items).toEqual([]);
  });

  it('GPS: geçerli koordinat döner, -180 sentinel/null → null', async () => {
    const res = await listPhotos({ udid, rootPath });
    const byName = Object.fromEntries(res.items.map((i) => [i.filename, i]));
    expect(byName['IMG_0001.HEIC']!.latitude).toBeCloseTo(41.0082);
    expect(byName['IMG_0001.HEIC']!.longitude).toBeCloseTo(28.9784);
    expect(byName['IMG_0002.PNG']!.latitude).toBeNull();
    expect(byName['IMG_0003.MOV']!.longitude).toBeNull();
  });
});

describe('albümler — eski/minimal şema', () => {
  it('ZGENERICALBUM / ara tablo / opsiyonel kolon yoksa yalnızca desteklenenler', async () => {
    _resetTmpCacheForTest();
    const rootPath = getTmpRoot();
    const udid = 'd'.repeat(40);
    const db = new Database(placeDb(rootPath, udid));
    db.exec(`
      CREATE TABLE ZASSET (
        Z_PK INTEGER PRIMARY KEY, ZDIRECTORY TEXT, ZFILENAME TEXT, ZDATECREATED REAL,
        ZFAVORITE INTEGER, ZHIDDEN INTEGER, ZKIND INTEGER, ZTRASHEDSTATE INTEGER,
        ZWIDTH INTEGER, ZHEIGHT INTEGER, ZDURATION REAL, ZUNIFORMTYPEIDENTIFIER TEXT
      );
      INSERT INTO ZASSET (ZDIRECTORY, ZFILENAME, ZDATECREATED, ZKIND, ZTRASHEDSTATE)
        VALUES ('DCIM', 'A.MOV', 1, 1, 0);
    `);
    db.close();
    const albums = await listAlbums({ udid, rootPath });
    expect(albums.map((a) => a.id)).toEqual(['smart:videos']);
    // ZKINDSUBTYPE yok → Live Photos filtresi karşılanamaz → boş
    const live = await listPhotos({ udid, rootPath, albumId: 'smart:livePhotos' });
    expect(live.total).toBe(0);
    const user = await listPhotos({ udid, rootPath, albumId: 'album:1' });
    expect(user.total).toBe(0);
  });

  it('Photos.sqlite yoksa boş liste', async () => {
    _resetTmpCacheForTest();
    const rootPath = getTmpRoot();
    const udid = 'e'.repeat(40);
    fs.mkdirSync(path.join(rootPath, udid), { recursive: true });
    expect(await listAlbums({ udid, rootPath })).toEqual([]);
  });
});
