import path from 'node:path';
import { openPhotosDb } from './photosDb';
import { readPhotosSchema, buildAssetWhere, parseAlbumId } from './albumSchema';
import { computeFileId } from '@main/modules/manifest/fileId';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import type { PhotoMeta, PhotosResult, PhotosRequest } from '@shared/domain';

interface ZAssetRow {
  ZDIRECTORY: string | null;
  ZFILENAME: string | null;
  ZDATECREATED: number | null;
  ZFAVORITE: number | null;
  ZHIDDEN: number | null;
  ZKIND: number | null;
  ZWIDTH: number | null;
  ZHEIGHT: number | null;
  ZDURATION: number | null;
  ZUNIFORMTYPEIDENTIFIER: string | null;
  ZLATITUDE?: number | null;
  ZLONGITUDE?: number | null;
}

// iOS konumsuz asset'lerde ZLATITUDE/ZLONGITUDE = -180 (sentinel) yazar; 0,0 da anlamsız.
function validCoord(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (lat === -180 || lon === -180) return false;
  if (lat === 0 && lon === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export async function listPhotos(req: PhotosRequest): Promise<PhotosResult> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openPhotosDb(req.udid, backupRoot);
  const offset = Math.max(0, req.offset ?? 0);
  if (!db) return { items: [], total: 0, offset };

  try {
    // Şema keşfi (albüm ara tablosu + opsiyonel kolonlar) — iOS sürümü sabit kodlanmaz.
    const schema = readPhotosSchema(db);

    // Filtre SQL'de — sayfalama filtre altında tutarlı, satırlar renderer'a taşınmaz.
    // Albüm filtresi de aynı WHERE'e eklenir (Z_<n>ASSETS alt sorgusu / ZASSET kolonu).
    const where = buildAssetWhere(schema, {
      favoritesOnly: req.favoritesOnly,
      includeHidden: req.includeHidden,
      album: parseAlbumId(req.albumId),
    });
    // Albüm bu şemada karşılanamıyor (bilinmeyen id / kolon yok) → boş, crash değil.
    if (!where) return { items: [], total: 0, offset };

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM ZASSET WHERE ${where.sql}`)
      .get(...where.params) as { total: number };

    // limit yoksa tümü (geriye uyumluluk); varsa LIMIT/OFFSET sayfası.
    // Binlerce satırın tek IPC yanıtında taşınması ilk açılış kasmasının ana
    // kaynağıydı (structured clone + satır başına SHA1) — sayfa başına maliyet küçük.
    const pageSql =
      req.limit != null
        ? ` LIMIT ${Math.max(1, Math.floor(req.limit))} OFFSET ${Math.floor(offset)}`
        : '';

    // GPS kolonları eski/sentetik şemalarda olmayabilir — varsa seçilir.
    const hasGps = schema.assetCols.has('ZLATITUDE') && schema.assetCols.has('ZLONGITUDE');
    const gpsSql = hasGps ? ', ZLATITUDE, ZLONGITUDE' : '';

    // ZASSET: çöp hariç (Son Silinenler albümü hariç), en yeni önce
    const rows = db
      .prepare(
        `SELECT ZDIRECTORY, ZFILENAME, ZDATECREATED, ZFAVORITE, ZHIDDEN, ZKIND,
                ZWIDTH, ZHEIGHT, ZDURATION, ZUNIFORMTYPEIDENTIFIER${gpsSql}
         FROM ZASSET
         WHERE ${where.sql}
         ORDER BY ZDATECREATED DESC${pageSql}`,
      )
      .all(...where.params) as ZAssetRow[];

    const items: PhotoMeta[] = rows.map((r) => {
      const relativePath = `Media/${r.ZDIRECTORY}/${r.ZFILENAME}`;
      const filename = r.ZFILENAME as string;
      const ext = (path.extname(filename).slice(1) || '').toUpperCase();
      const gps = validCoord(r.ZLATITUDE, r.ZLONGITUDE);
      return {
        fileId: computeFileId('CameraRollDomain', relativePath),
        relativePath,
        filename,
        ext,
        isVideo: r.ZKIND === 1,
        dateTakenIso:
          r.ZDATECREATED != null ? appleSecondsToDate(r.ZDATECREATED).toISOString() : null,
        isFavorite: r.ZFAVORITE === 1,
        isHidden: r.ZHIDDEN === 1,
        width: r.ZWIDTH,
        height: r.ZHEIGHT,
        durationSec: r.ZDURATION,
        uti: r.ZUNIFORMTYPEIDENTIFIER,
        latitude: gps ? (r.ZLATITUDE as number) : null,
        longitude: gps ? (r.ZLONGITUDE as number) : null,
      };
    });

    return { items, total, offset };
  } finally {
    db.close();
  }
}
