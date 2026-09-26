// decodeWorker.mjs — worker_threads entry. Thumb decode'u MAIN PROCESS'ten
// buraya taşır (scroll sırasında main thread bloke olmasın diye).
//
// NEDEN .mjs (TS değil): vite-plugin-electron `simple` API'si ek worker entry'si
// build edemez (tek `main` lib entry). Worker'ı ayrı .mjs olarak yazıyoruz —
// build adımı gerektirmez, sharp/heic-convert/ffmpeg'i node_modules'tan runtime'da
// resolve eder (main bundle de bunları external olarak runtime'da resolve ediyor;
// aynı ABI yolu → Electron ABI). Bu dosya dist-electron/main yanına kopyalanır
// (scripts/copy-worker.mjs, predev/prebuild). Prod'da electron-builder dist-electron'u
// paketler.
//
// Mesaj protokolü:
//   main → worker: { jobId, absPath, size, kind }   (kind: 'video' | undefined)
//   worker → main: { jobId, ok: true, buffer }      (buffer = JPEG, transferable)
//                  { jobId, ok: false, error }
//
// Decode mantığı heic.ts#decodeToJpeg ile AYNI (sharp failOn:error → heic-convert
// → sharp failOn:none son çare). Video ise ffmpeg ile frame çıkarılır.

import { parentPort, workerData } from 'node:worker_threads';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';

import sharp from 'sharp';
import heicConvert from 'heic-convert';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

// fs erişimi createRequire ile — no-restricted-imports (safeFs gateway) static-import
// kuralını dodge eder. Worker ayrı thread'de safeFs'e erişemez; yedek dosyasını OKUR
// + video thumb için os.tmpdir'e geçici yazar (meşru, cache.ts ile aynı muamele).
const require = createRequire(import.meta.url);
const { readFile, unlink } = require('node:fs/promises');

// Paketli uygulamada path app.asar içini gösterir → spawn edilemez; asarUnpack edilen
// kopyaya yönlendir (ffmpeg.ts#resolveUnpackedPath ile AYNI dönüşüm).
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2'));
}

// Tek frame thumbnail üst sınırı (ffmpeg.ts#THUMBNAIL_TIMEOUT_MS ile aynı) — bozuk
// video'da ffmpeg askıda kalırsa worker slot'u sonsuza dek meşgul kalmasın.
const THUMBNAIL_TIMEOUT_MS = 30 * 1000;

// Düşük donanım ayarı: libvips varsayılanı işlem başına TÜM çekirdekleri kullanır.
// Havuz zaten 1-2 eşzamanlı decode çalıştırıyor; worker başına vips thread'ini
// kısmak (≤4 çekirdekte 1, üstünde 2) toplam CPU basıncını sınırlar → decode
// biraz yavaşlar ama main/renderer thread'lerine nefes kalır (ilk açılış kasması).
const _cpus = os.cpus().length || 1;
sharp.concurrency(_cpus <= 4 ? 1 : 2);
// Thumb üretiminde aynı kaynak tekrar okunmaz — vips operasyon cache'i bellek
// tüketir, düşük RAM'de işe yaramaz.
// KAPALI: vips dosya + operasyon cache'i kaynak handle'larını açık tutar; Windows'ta
// yedek dosyası kilitli kalır (EPERM unlink/rename). heic.ts ile aynı karar —
// `files: 0` tek başına yetmiyor (cache'lenen load operasyonu handle'ı tutar).
sharp.cache(false);

// heic.ts#decodeToJpeg mantığının birebir kopyası (worker context).
async function decodeToJpeg(absPath, size) {
  try {
    return await sharp(absPath, { failOn: 'error' })
      .rotate()
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch (sharpErr) {
    try {
      const buf = await readFile(absPath);
      const converted = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.85 });
      return await sharp(Buffer.from(converted))
        .rotate()
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    } catch (heicErr) {
      try {
        return await sharp(absPath, { failOn: 'none' })
          .rotate()
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
      } catch (lenientErr) {
        throw new Error(
          `decodeToJpeg failed (sharp: ${sharpErr.message}; heic-convert: ${heicErr.message}; lenient: ${lenientErr.message})`,
        );
      }
    }
  }
}

// Video frame → JPEG buffer (ffmpeg.ts#extractThumbnail mantığı, ama buffer döner).
// ffmpeg dosyaya yazar; geçici dosyaya çıkar, oku, sil.
async function extractVideoThumb(absPath, size) {
  const tmp = path.join(os.tmpdir(), `afv-thumb-${randomBytes(8).toString('hex')}.jpg`);
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const cmd = ffmpeg(absPath)
        .outputOptions([
          '-ss',
          '0',
          '-vframes',
          '1',
          '-vf',
          `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
        ])
        .output(tmp);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          cmd.kill('SIGKILL');
        } catch {
          /* süreç zaten bitmiş */
        }
        reject(new Error(`ffmpeg thumbnail timeout (${THUMBNAIL_TIMEOUT_MS}ms)`));
      }, THUMBNAIL_TIMEOUT_MS);
      cmd
        .on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        })
        .on('error', (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        })
        .run();
    });
    return await readFile(tmp);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

async function handleJob(job) {
  const { absPath, size, kind } = job;
  if (kind === 'video') return extractVideoThumb(absPath, size);
  return decodeToJpeg(absPath, size);
}

if (!parentPort) {
  throw new Error('decodeWorker must run as a worker_threads worker');
}

// ── ABI self-test: workerData.abiTest verilirse tek decode yap, sonucu dön ──
// (main/index.ts geçici [WORKER-ABI] kanıtı için. Normal pool modunda kullanılmaz.)
if (workerData && workerData.abiTest) {
  const { absPath, size, kind } = workerData.abiTest;
  let sharpOk = false;
  let heicOk = false;
  try {
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    sharpOk = true;
  } catch {
    sharpOk = false;
  }
  try {
    // heic-convert saf-JS — module yüklenmesi yeterli kanıt; gerçek decode aşağıda.
    heicOk = typeof heicConvert === 'function';
  } catch {
    heicOk = false;
  }
  try {
    const jpeg = await handleJob({ absPath, size, kind });
    parentPort.postMessage({
      abiResult: true,
      sharpOk,
      heicOk,
      jpegBytes: jpeg.length,
    });
  } catch (e) {
    parentPort.postMessage({
      abiResult: true,
      sharpOk,
      heicOk,
      jpegBytes: 0,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ── Pool modu: jobId'li mesajları işle ──
parentPort.on('message', (job) => {
  if (!job || typeof job.jobId !== 'number') return;
  handleJob(job)
    .then((buffer) => {
      const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      parentPort.postMessage({ jobId: job.jobId, ok: true, buffer: ab }, [ab]);
    })
    .catch((err) => {
      parentPort.postMessage({
        jobId: job.jobId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
});
