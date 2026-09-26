import { computeFileId } from '@main/modules/manifest/fileId';
import type { Attachment } from '@shared/domain';

/**
 * attachment.filename → fileId. iOS sms.db'de attachment.filename genelde:
 *   `~/Library/SMS/Attachments/aa/bb/UUID/IMG_xxxx.HEIC`
 * formatında. `~/Library/` prefix soyulup MediaDomain relPath kurulur:
 *   MediaDomain + `Library/SMS/Attachments/...` → computeFileId
 *
 * Bazı yedeklerde filename zaten relative (`Library/SMS/...`) olabilir → onu da dene.
 * Çözülemezse null (UI "dosya bulunamadı" gösterir).
 */
export function resolveAttachmentFileId(filename: string | null): string | null {
  if (!filename) return null;
  let rel = filename.trim();
  if (!rel) return null;

  // `~/Library/...` veya `/var/mobile/Library/...` → `Library/...`
  rel = rel.replace(/^~\//, '');
  const libIdx = rel.indexOf('Library/SMS/');
  if (libIdx >= 0) {
    rel = rel.slice(libIdx);
  } else {
    // Library/SMS bulunamadıysa ham relative path'i dene (en kötü olasılık)
    rel = rel.replace(/^\/+/, '');
  }

  if (!rel) return null;
  return computeFileId('MediaDomain', rel);
}

/** MIME tipinden inline render tipi türetir. */
export function attachmentKind(mimeType: string | null): Attachment['kind'] {
  const m = (mimeType ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
}
