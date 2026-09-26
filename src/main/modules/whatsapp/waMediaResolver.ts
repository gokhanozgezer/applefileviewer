import { computeFileId } from '@main/modules/manifest/fileId';
import { WA_DOMAIN } from './whatsappDb';
import type { WaMedia } from '@shared/domain';

/**
 * ZWAMEDIAITEM.ZMEDIALOCALPATH → fileId.
 *
 * WhatsApp medya path'leri ChatStorage ile AYNI app group container'ında
 * relative tutulur, ör:
 *   `Message/Media/905xxx@s.whatsapp.net/3/9/UUID/REC_OUT_xxx.jpg`
 *   `Media/.../PTT-xxx.opus`
 * relativePath = localPath (baştaki `/` veya `~/` soyulur) → computeFileId(WA_DOMAIN, rel).
 *
 * Çözülemezse null (UI "dosya bulunamadı" gösterir).
 */
export function resolveWaMediaFileId(localPath: string | null): string | null {
  if (!localPath) return null;
  let rel = localPath.trim();
  if (!rel) return null;

  // `~/...` veya mutlak `/var/mobile/.../Message/Media/...` → relative'e indir
  rel = rel.replace(/^~\//, '');
  const msgIdx = rel.indexOf('Message/Media/');
  const mediaIdx = rel.indexOf('Media/');
  if (msgIdx >= 0) {
    rel = rel.slice(msgIdx); // zaten Message/Media/ var → koru
  } else if (mediaIdx >= 0) {
    // GERÇEK-VERİ: ZMEDIALOCALPATH = `Media/905x@.../d/c/UUID.jpg` (Message/ YOK).
    // Disk'te dosya `Message/Media/...` altında → fileId için Message/ prefix ZORUNLU.
    rel = 'Message/' + rel.slice(mediaIdx);
  } else {
    rel = rel.replace(/^\/+/, '');
  }

  if (!rel) return null;
  return computeFileId(WA_DOMAIN, rel);
}

/**
 * ZWAMESSAGE.ZMESSAGETYPE → render tipi.
 * WhatsApp messageType kodları: 0 text, 1 image, 2 video, 3 audio/ptt,
 * 4 contact, 5 location, 7 url, 8 document, 11 gif, 14 sticker...
 * Bilinmeyen medya tipleri 'file' fallback.
 */
export function waMediaKind(messageType: number | null): WaMedia['kind'] {
  switch (messageType) {
    case 1:
      return 'image';
    case 2:
      return 'video';
    case 3:
      return 'audio';
    case 11:
    case 14:
      return 'image'; // gif / sticker → image render
    default:
      return 'file';
  }
}

/** Render tipinden basit MIME türetir (gerçek MIME ChatStorage'da güvenilir değil). */
export function waMimeFromKind(kind: WaMedia['kind']): string | null {
  switch (kind) {
    case 'image':
      return 'image/jpeg';
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/ogg';
    default:
      return null;
  }
}
