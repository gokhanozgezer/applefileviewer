import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

/**
 * Paketli uygulamada ffmpeg-static'in döndürdüğü path app.asar İÇİNİ gösterir;
 * asar arşivindeki bir exe spawn EDİLEMEZ (ENOENT). electron-builder asarUnpack
 * ile binary app.asar.unpacked'a çıkarılır → path'i oraya yönlendir.
 * Dev'de (asar yok) path değişmez. Pure — test edilebilir.
 */
export function resolveUnpackedPath(p: string): string {
  return p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

// ffmpeg-static binary path'i __dirname kullanır → ESM bundle'da inline edilmez
// (vite.config.ts rollupOptions.external'da). Path varsa fluent-ffmpeg'e bildir.
if (ffmpegPath) ffmpeg.setFfmpegPath(resolveUnpackedPath(ffmpegPath));

// ─── Global eşzamanlılık sınırı ──────────────────────────────────────────────
// Main process'teki TÜM ffmpeg çalışmaları (transcode + thumbnail) bu semafordan
// geçer: Lightbox preheat + birkaç sesli mesaj aynı anda 5-6 ffmpeg açıp düşük-CPU
// makineyi kilitlemesin. (Worker'daki video thumb'ları decodePool maxConcurrent ile
// ayrıca sınırlı.)
export const FFMPEG_MAX_CONCURRENT = 2;

let active = 0;
const waiters: (() => void)[] = [];

async function withFfmpegSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= FFMPEG_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  } else {
    active++;
  }
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    // Slot doğrudan sıradakine devredilir (active değişmez); sıra boşsa bırakılır.
    if (next) next();
    else active--;
  }
}

/** Test-only — şu an çalışan ffmpeg sayısı. */
export function _activeFfmpegCountForTest(): number {
  return active;
}

/** Test-only — semaforu, verilen iş ile doğrudan dener (ffmpeg spawn etmeden). */
export const _withFfmpegSlotForTest = withFfmpegSlot;

// ─── Timeout ─────────────────────────────────────────────────────────────────
/** Transcode üst sınırı — 182MB HEVC ~60sn; 10 dk askıda kalmış süreçtir. */
export const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000;
/** Tek frame thumbnail üst sınırı. */
export const THUMBNAIL_TIMEOUT_MS = 30 * 1000;

/** fluent-ffmpeg komutunun kullandığımız alt kümesi (test'te sahte komut verilebilir). */
interface KillableCommand {
  on(event: 'end', cb: () => void): unknown;
  on(event: 'error', cb: (e: Error) => void): unknown;
  kill(signal?: string): unknown;
}

/**
 * Komutu çalıştırır; timeoutMs içinde bitmezse SIGKILL ile öldürür ve reddeder.
 * start: komutu başlatan çağrı (.save/.run). Yarım çıktı dosyasını caller siler
 * (cache.ts#produceCacheFile geçici path'i unlink eder).
 */
export function runWithTimeout(
  cmd: KillableCommand,
  start: () => void,
  timeoutMs: number,
  label: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        cmd.kill('SIGKILL');
      } catch {
        /* süreç zaten bitmiş olabilir */
      }
      reject(new Error(`ffmpeg ${label} timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    cmd.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    });
    cmd.on('error', (e: Error) => {
      if (settled) return; // kill sonrası gelen error yutulur (timeout zaten raporlandı)
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    start();
  });
}

export interface TranscodeOpts {
  inputAbs: string;
  outputAbs: string;
  to: 'mp4' | 'mp3';
  /** Varsayılan TRANSCODE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * inputAbs → outputAbs transcode (H.264/AAC MP4 veya MP3).
 * NOT: outputAbs GEÇİCİ path olmalı — caller cache.ts#produceCacheFile ile çağırır
 * (dizin oluşturma + başarıda rename + hatada unlink orada). Burada fs'e dokunmuyoruz
 * (ESLint no-restricted-imports — bu dosya safeFs/cache override kapsamında değil).
 *
 * mp4: libx264 + aac, +faststart (web seek için moov başa), preset veryfast.
 * mp3: video atılır, libmp3lame.
 * Global semafor (FFMPEG_MAX_CONCURRENT) + timeout (kill).
 */
export async function transcode(opts: TranscodeOpts): Promise<void> {
  await withFfmpegSlot(() => {
    const cmd = ffmpeg(opts.inputAbs);
    if (opts.to === 'mp4') {
      cmd
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-movflags', '+faststart', '-preset', 'veryfast'])
        .format('mp4');
    } else {
      cmd.noVideo().audioCodec('libmp3lame').format('mp3');
    }
    return runWithTimeout(
      cmd,
      () => cmd.save(opts.outputAbs),
      opts.timeoutMs ?? TRANSCODE_TIMEOUT_MS,
      'transcode',
    );
  });
}

/**
 * Video'dan thumbnail frame çıkarır (JPEG). HEIC/JPG decode'dan FARKLI — video
 * container'ı sharp/heic-convert açamaz (422 "not a HEIC image"). ffmpeg ilk
 * saniyeden bir frame alır, size'a ölçekler.
 * NOT: outputAbs GEÇİCİ path olmalı (caller produceCacheFile) — uzantı .jpg ile
 * bitmeli (format uzantıdan çıkarılır). Global semafor + 30 sn timeout.
 */
export async function extractThumbnail(
  inputAbs: string,
  outputAbs: string,
  size: number,
  timeoutMs = THUMBNAIL_TIMEOUT_MS,
): Promise<void> {
  await withFfmpegSlot(() => {
    const cmd = ffmpeg(inputAbs)
      // -ss 0: ilk frame (kısa videolarda da güvenli). scale: en uzun kenar size, aspect korunur.
      .outputOptions([
        '-ss',
        '0',
        '-vframes',
        '1',
        '-vf',
        `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
      ])
      .output(outputAbs);
    return runWithTimeout(cmd, () => cmd.run(), timeoutMs, 'thumbnail');
  });
}
