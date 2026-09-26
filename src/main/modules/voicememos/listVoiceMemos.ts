import path from 'node:path';
import { openVoiceMemosDb, VOICEMEMOS_DOMAIN } from './voiceMemosDb';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import { computeFileId } from '@main/modules/manifest/fileId';
import type { VoiceMemo, VoiceMemosRequest } from '@shared/domain';

interface VoiceMemoRow {
  pk: number;
  date: number | null;
  duration: number | null;
  customLabel: string | null;
  zpath: string | null;
}

/**
 * ZDATE Apple epoch SANİYE (FLOAT, ham 736422157.667 → 2024-05-03) → appleSecondsToDate.
 * Geçersiz / null → null (crash değil).
 */
function toIso(raw: number | null): string | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  try {
    return appleSecondsToDate(raw).toISOString();
  } catch {
    return null;
  }
}

/**
 * Başlık: ZCUSTOMLABEL (doluysa) → yoksa ZPATH dosya adı (uzantısız) → yoksa ISO tarih.
 */
function resolveTitle(
  customLabel: string | null,
  zpath: string | null,
  dateIso: string | null,
): string {
  const label = (customLabel ?? '').trim();
  if (label) return label;
  const file = (zpath ?? '').trim();
  if (file) {
    const base = path.basename(file, path.extname(file));
    if (base) return base;
  }
  return dateIso ?? '';
}

/**
 * ZCLOUDRECORDING (ZRECORDING DEĞİL) → VoiceMemo[]. ORDER BY ZDATE DESC (en yeni ilk).
 * Ses dosyası: Recordings/<ZPATH> → computeFileId(VoiceMemos.shared, 'Recordings/'+ZPATH).
 *
 * Boş tablo / tablo yok / şema farkı → try/catch → [] (crash değil).
 */
export async function listVoiceMemos(req: VoiceMemosRequest): Promise<VoiceMemo[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openVoiceMemosDb(req.udid, backupRoot);
  if (!db) return []; // CloudRecordings.db yok — boş

  try {
    const rows = db
      .prepare(
        `SELECT Z_PK AS pk, ZDATE AS date, ZDURATION AS duration,
                ZCUSTOMLABEL AS customLabel, ZPATH AS zpath
         FROM ZCLOUDRECORDING
         ORDER BY ZDATE DESC`,
      )
      .all() as VoiceMemoRow[];

    return rows.map((r) => {
      const dateIso = toIso(r.date);
      const zpath = (r.zpath ?? '').trim();
      const fileId = computeFileId(VOICEMEMOS_DOMAIN, `Recordings/${zpath}`);
      return {
        id: r.pk,
        title: resolveTitle(r.customLabel, r.zpath, dateIso),
        dateIso,
        durationSec: r.duration == null ? 0 : Math.max(0, Math.round(r.duration)),
        fileId,
      };
    });
  } catch {
    // ZCLOUDRECORDING tablosu yok / şema farkı — boş liste (crash değil)
    return [];
  } finally {
    db.close();
  }
}
