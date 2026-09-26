import type { ReadOnlyDb } from '@main/util/sqlite';
import type { PhotoSmartAlbumKey } from '@shared/domain';

/**
 * Photos.sqlite şema keşfi — iOS sürümüne göre değişen isimler SABİT KODLANMAZ.
 *
 * Albüm↔asset ara tablosu Core Data'nın entity numarasıyla adlanır:
 *   iOS 14: Z_26ASSETS(Z_26ALBUMS, Z_3ASSETS, Z_FOK_3ASSETS)
 *   iOS 16: Z_28ASSETS(Z_28ALBUMS, Z_3ASSETS, ...)
 * Numara sürümden sürüme kayar → sqlite_master + PRAGMA table_info ile bulunur.
 */
export interface AlbumJoin {
  table: string;
  albumCol: string;
  assetCol: string;
}

export interface PhotosSchema {
  /** ZASSET kolonları (büyük harf). */
  assetCols: Set<string>;
  /** ZGENERICALBUM kolonları — tablo yoksa boş küme. */
  albumCols: Set<string>;
  join: AlbumJoin | null;
}

// Tablo/kolon isimleri SQL'e interpolasyonla girer → yalnızca bu desenler kabul edilir.
const JOIN_TABLE_RE = /^Z_(\d+)ASSETS$/;
const ALBUM_COL_RE = /^Z_(\d+)ALBUMS$/;
const ASSET_COL_RE = /^Z_(\d+)ASSETS$/;

function tableColumns(db: ReadOnlyDb, table: string): Set<string> {
  // table adı çağıran tarafta sqlite_master'dan ya da sabit — regex doğrulamalı.
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name.toUpperCase()));
}

export function findAlbumJoin(db: ReadOnlyDb): AlbumJoin | null {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'Z\\_%ASSETS' ESCAPE '\\'`,
    )
    .all() as { name: string }[];

  const candidates: (AlbumJoin & { exact: boolean })[] = [];
  for (const { name } of tables) {
    const m = JOIN_TABLE_RE.exec(name);
    if (!m) continue;
    const cols = [...tableColumns(db, name)];
    const albumCol = cols.find((c) => ALBUM_COL_RE.test(c));
    // Asset kolonu: Z_<n>ASSETS (Z_FOK_<n>ASSETS sıralama kolonu — desen onu dışlar).
    const assetCol = cols.find((c) => ASSET_COL_RE.test(c));
    if (!albumCol || !assetCol) continue;
    // Tablo numarası = albüm kolonu numarası olan eşleşme asıl ilişkidir.
    const exact = ALBUM_COL_RE.exec(albumCol)![1] === m[1];
    candidates.push({ table: name, albumCol, assetCol, exact });
  }
  candidates.sort((a, b) => Number(b.exact) - Number(a.exact) || a.table.localeCompare(b.table));
  const best = candidates[0];
  return best ? { table: best.table, albumCol: best.albumCol, assetCol: best.assetCol } : null;
}

export function readPhotosSchema(db: ReadOnlyDb): PhotosSchema {
  const hasAlbumTable =
    db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ZGENERICALBUM'`)
      .get() != null;
  return {
    assetCols: tableColumns(db, 'ZASSET'),
    albumCols: hasAlbumTable ? tableColumns(db, 'ZGENERICALBUM') : new Set(),
    join: findAlbumJoin(db),
  };
}

/**
 * Akıllı albüm → ZASSET WHERE parçası. Gereken kolon şemada yoksa null
 * (o albüm listelenmez / istenirse boş sonuç).
 * ZKINDSUBTYPE: 1 panorama, 2 Live Photo, 10 ekran görüntüsü.
 * ZDERIVEDCAMERACAPTUREDEVICE: 1 ön kamera (selfie) — yeni iOS'larda ZASSET üzerinde.
 */
export function smartAlbumPredicate(key: PhotoSmartAlbumKey, cols: Set<string>): string | null {
  switch (key) {
    case 'videos':
      return cols.has('ZKIND') ? 'ZKIND = 1' : null;
    case 'screenshots': {
      const parts: string[] = [];
      if (cols.has('ZISDETECTEDSCREENSHOT')) parts.push('ZISDETECTEDSCREENSHOT = 1');
      if (cols.has('ZKINDSUBTYPE')) parts.push('ZKINDSUBTYPE = 10');
      return parts.length > 0 ? `(${parts.join(' OR ')})` : null;
    }
    case 'selfies':
      return cols.has('ZDERIVEDCAMERACAPTUREDEVICE') ? 'ZDERIVEDCAMERACAPTUREDEVICE = 1' : null;
    case 'livePhotos':
      return cols.has('ZKINDSUBTYPE') ? 'ZKINDSUBTYPE = 2' : null;
    case 'panoramas':
      return cols.has('ZKINDSUBTYPE') ? 'ZKINDSUBTYPE = 1' : null;
    case 'recentlyDeleted':
      // Çöp filtresi temel WHERE'de ters çevrilir (ZTRASHEDSTATE = 1) — ek parça yok.
      return cols.has('ZTRASHEDSTATE') ? '1 = 1' : null;
  }
}

export const SMART_ALBUM_ORDER: readonly PhotoSmartAlbumKey[] = [
  'videos',
  'livePhotos',
  'selfies',
  'screenshots',
  'panoramas',
  'recentlyDeleted',
];

export function isSmartAlbumKey(v: string): v is PhotoSmartAlbumKey {
  return (SMART_ALBUM_ORDER as readonly string[]).includes(v);
}

// ZGENERICALBUM.ZKIND = 2 → kullanıcının oluşturduğu albüm (klasör 4000, akıllı 15xx vb. hariç).
export const USER_ALBUM_KIND = 2;

export type AlbumFilter =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'user'; pk: number }
  | { kind: 'smart'; key: PhotoSmartAlbumKey };

export function parseAlbumId(albumId: string | undefined): AlbumFilter {
  if (!albumId || albumId === 'all') return { kind: 'none' };
  const user = /^album:(\d+)$/.exec(albumId);
  if (user) return { kind: 'user', pk: Number(user[1]) };
  const smart = /^smart:(\w+)$/.exec(albumId);
  if (smart && isSmartAlbumKey(smart[1]!)) return { kind: 'smart', key: smart[1] };
  return { kind: 'invalid' };
}

/**
 * Ortak ZASSET WHERE üretimi — listPhotos ve albüm sayaçları AYNI kuralları kullanır.
 * Parametre: kullanıcı albümü Z_PK'si (bind edilir, interpolasyon yok).
 * null → filtre bu şemada karşılanamaz (boş sonuç).
 */
export function buildAssetWhere(
  schema: PhotosSchema,
  opts: { favoritesOnly?: boolean; includeHidden?: boolean; album: AlbumFilter },
): { sql: string; params: number[] } | null {
  const { album } = opts;
  if (album.kind === 'invalid') return null;
  const trashed = album.kind === 'smart' && album.key === 'recentlyDeleted';
  const where = [
    trashed ? 'ZTRASHEDSTATE = 1' : 'ZTRASHEDSTATE = 0',
    'ZDIRECTORY IS NOT NULL',
    'ZFILENAME IS NOT NULL',
  ];
  const params: number[] = [];
  if (opts.favoritesOnly) where.push('ZFAVORITE = 1');
  if (opts.includeHidden === false) where.push('(ZHIDDEN IS NULL OR ZHIDDEN = 0)');
  if (album.kind === 'smart') {
    const pred = smartAlbumPredicate(album.key, schema.assetCols);
    if (pred == null) return null;
    if (pred !== '1 = 1') where.push(pred);
  } else if (album.kind === 'user') {
    const j = schema.join;
    if (!j) return null;
    where.push(`Z_PK IN (SELECT "${j.assetCol}" FROM "${j.table}" WHERE "${j.albumCol}" = ?)`);
    params.push(album.pk);
  }
  return { sql: where.join(' AND '), params };
}
