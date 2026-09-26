import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { readFile } from '@main/safeFs';

// libvips cache'i (dosya + operasyon cache'i — cache'lenen jpegload/heifload
// operasyonu kaynak dosyanın handle'ını AÇIK tutar) Windows'ta yedek dosyasının/
// test fixture'ının silinmesini engeller (EPERM unlink). `files: 0` tek başına
// YETMEDİ (operasyon cache'i handle'ı tutmaya devam etti) → cache tamamen kapalı.
// Aynı kaynak zaten tekrar decode edilmiyor (sonuç userData/cache'te) — kayıp yok.
sharp.cache(false);

/**
 * HEIC/herhangi-görsel → boyutlandırılmış JPEG buffer.
 * 1. sharp failOn:'error' dene (sağlam JPG/PNG + EXIF orientation rotate)
 * 2. sharp fail → heic-convert fallback (gerçek HEIC, libheif/HEVC codec yoksa)
 * 3. heic-convert fail → sharp failOn:'none' (TRUNCATED JPG/PNG son çare —
 *    yedekte "Premature end of input file" olan eksik dosyalar; katı failOn:'error'
 *    bunları reddedip 422'ye düşürüyordu. failOn:'none' kısmi/bozuk veriyi yine decode eder)
 * 4. Üçü de fail → throw (caller tile ImageOff gösterir)
 *
 * Aspect: fit:'inside' tek boyut → en uzun kenar size, aspect korunur (grid CSS object-cover crop).
 */
export async function decodeToJpeg(absPath: string, size: number): Promise<Buffer> {
  try {
    return await sharp(absPath, { failOn: 'error' })
      .rotate() // EXIF orientation — argümansız = otomatik uygula (KRİTİK)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true }) // aspect korur, en uzun kenar size
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch (sharpErr) {
    // heic-convert fallback — sharp libheif/HEVC codec yoksa buraya düşer
    try {
      const buf = await readFile(absPath);
      // heic-convert Node Buffer'ı doğrudan kabul eder
      const converted = await heicConvert({
        buffer: buf as unknown as ArrayBuffer,
        format: 'JPEG',
        quality: 0.85,
      });
      // heic-convert sonrası sharp ile resize + EXIF orientation
      return await sharp(Buffer.from(converted))
        .rotate()
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    } catch (heicErr) {
      // SON ÇARE: truncated/bozuk JPG/PNG — failOn:'none' kısmi veriyi kurtarır.
      // (Gerçek-veri: yedekte "Premature end of input file" JPG'ler 422 veriyordu.)
      try {
        return await sharp(absPath, { failOn: 'none' })
          .rotate()
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
      } catch (lenientErr) {
        throw new Error(
          `decodeToJpeg failed (sharp: ${(sharpErr as Error).message}; heic-convert: ${(heicErr as Error).message}; lenient: ${(lenientErr as Error).message})`,
        );
      }
    }
  }
}
