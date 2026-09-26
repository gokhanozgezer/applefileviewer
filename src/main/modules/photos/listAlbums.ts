import path from 'node:path';
import { openPhotosDb } from './photosDb';
import {
  readPhotosSchema,
  buildAssetWhere,
  SMART_ALBUM_ORDER,
  USER_ALBUM_KIND,
  type PhotosSchema,
} from './albumSchema';
import type { ReadOnlyDb } from '@main/util/sqlite';
import type { PhotoAlbum, PhotoAlbumsRequest } from '@shared/domain';

function countWhere(db: ReadOnlyDb, sql: string, params: number[]): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ZASSET WHERE ${sql}`).get(...params) as {
    n: number;
  };
  return row.n;
}

function smartAlbums(db: ReadOnlyDb, schema: PhotosSchema, includeHidden: boolean): PhotoAlbum[] {
  const out: PhotoAlbum[] = [];
  for (const key of SMART_ALBUM_ORDER) {
    const where = buildAssetWhere(schema, { includeHidden, album: { kind: 'smart', key } });
    if (!where) continue; // kolon bu iOS sürümünde yok
    const count = countWhere(db, where.sql, where.params);
    // Boş akıllı albüm seçiciyi kalabalıklaştırmasın.
    if (count === 0) continue;
    out.push({ id: `smart:${key}`, kind: 'smart', title: null, smartKey: key, count });
  }
  return out;
}

function userAlbums(db: ReadOnlyDb, schema: PhotosSchema, includeHidden: boolean): PhotoAlbum[] {
  const { albumCols, join } = schema;
  if (!join || !albumCols.has('ZTITLE') || !albumCols.has('ZKIND')) return [];

  const where = [`ZKIND = ${USER_ALBUM_KIND}`, 'ZTITLE IS NOT NULL'];
  if (albumCols.has('ZTRASHEDSTATE')) where.push('(ZTRASHEDSTATE IS NULL OR ZTRASHEDSTATE = 0)');
  const rows = db
    .prepare(
      `SELECT Z_PK AS pk, ZTITLE AS title FROM ZGENERICALBUM
       WHERE ${where.join(' AND ')}
       ORDER BY ZTITLE COLLATE NOCASE`,
    )
    .all() as { pk: number; title: string }[];

  // Sayı: ZCACHEDCOUNT gizli/çöp ayrımını yapmaz → listelemeyle AYNI WHERE ile say.
  return rows.map((r) => {
    const w = buildAssetWhere(schema, { includeHidden, album: { kind: 'user', pk: r.pk } });
    return {
      id: `album:${r.pk}`,
      kind: 'user' as const,
      title: r.title,
      count: w ? countWhere(db, w.sql, w.params) : 0,
    };
  });
}

/** Photos.sqlite → akıllı albümler (şemada destekli olanlar) + kullanıcı albümleri. */
export async function listAlbums(req: PhotoAlbumsRequest): Promise<PhotoAlbum[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openPhotosDb(req.udid, backupRoot);
  if (!db) return [];
  try {
    const schema = readPhotosSchema(db);
    if (schema.assetCols.size === 0) return [];
    const includeHidden = req.includeHidden !== false;
    return [...smartAlbums(db, schema, includeHidden), ...userAlbums(db, schema, includeHidden)];
  } finally {
    db.close();
  }
}
