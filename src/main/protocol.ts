import path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { stat, createReadStream } from '@main/safeFs';
import { logger } from '@main/util/log';
import { lookupCache, writeCache, readCacheFile, produceCacheFile } from './cache';
import { getManifestMtimeMs } from './modules/backup/manifestMtime';
import { isUdidEncrypted } from './modules/backup/backupRegistry';
import { resolveBackupFile } from './modules/backup/resolveBackupFile';
import { isUdidUnlocked, sessionCacheDir } from './modules/backup/encryptedSessions';
import { transcode } from './util/ffmpeg';
import { getDecodePool } from './workers/decodePool';

export function registerProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'backup',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ]);
}

const backupRootByUdid = new Map<string, string>();

export function rememberBackupRoot(udid: string, backupRoot: string): void {
  backupRootByUdid.set(udid, backupRoot);
}

export function getRememberedRoot(udid: string): string | undefined {
  return backupRootByUdid.get(udid);
}

/**
 * Hatırlanan backup kök(ler)ini unut. udid verilirse yalnız o cihaz, verilmezse
 * hepsi. Backup klasörü override'ı temizlenince (backup IPC) çağrılır — eski
 * kökten medya servis edilmeye devam etmesin.
 */
export function clearBackupRootCache(udid?: string): void {
  if (udid === undefined) backupRootByUdid.clear();
  else backupRootByUdid.delete(udid);
}

function normPath(p: string): string {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function isPathUnder(target: string, root: string): boolean {
  const t = normPath(target);
  const r = normPath(root);
  if (t === r) return true;
  return t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/**
 * Yalnız hatırlanan kökü `parentRoot` altında olan udid'leri unut (override temizlenince).
 * Eskiden tümü siliniyordu → default kökteki AKTİF yedek de unutulup backup:// 404
 * veriyordu. keepUnder (ör. default kök) altındakiler, override onu kapsasa bile korunur.
 * Dönüş: unutulan udid sayısı.
 */
export function forgetBackupRootsUnder(
  parentRoot: string,
  keepUnder?: string | readonly string[] | null,
): number {
  // Birden çok varsayılan kök (Windows: iTunes + Apple Devices) — hepsinin altı korunur.
  const keeps = (typeof keepUnder === 'string' ? [keepUnder] : (keepUnder ?? [])).filter(Boolean);
  let removed = 0;
  for (const [udid, root] of backupRootByUdid) {
    if (!isPathUnder(root, parentRoot)) continue;
    if (keeps.some((k) => isPathUnder(root, k))) continue;
    backupRootByUdid.delete(udid);
    removed += 1;
  }
  return removed;
}

// ─── Content-Type (orig stream) ──────────────────────────────────────────────
// Yedek dosyaları uzantısız (fileId) saklanır. Tür: renderer ?ext= verdiyse
// uzantıdan, yoksa ilk baytlardan (magic number). nosniff ile birlikte gönderilir —
// Chromium kendi tahminini yapmaz, bilinmeyen tür octet-stream kalır.

const EXT_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  '3gp': 'video/3gpp',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  amr: 'audio/amr',
  caf: 'audio/x-caf',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  vcf: 'text/vcard',
};

export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

/** Uzantı (noktalı/noktasız, büyük/küçük harf) → MIME; bilinmiyorsa octet-stream. */
export function contentTypeForExt(ext: string | null | undefined): string {
  if (!ext) return FALLBACK_CONTENT_TYPE;
  const key = ext.replace(/^\./, '').toLowerCase();
  return EXT_CONTENT_TYPES[key] ?? FALLBACK_CONTENT_TYPE;
}

/** Dosyanın ilk baytlarından MIME tahmini (uzantısız yedek dosyaları için). */
export function sniffContentType(head: Uint8Array): string {
  const ascii = (from: number, to: number): string =>
    String.fromCharCode(...head.subarray(from, Math.min(to, head.length)));
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (head.length >= 4 && head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF') {
    const kind = ascii(8, 12);
    if (kind === 'WEBP') return 'image/webp';
    if (kind === 'WAVE') return 'audio/wav';
  }
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(0, 5) === '#!AMR') return 'audio/amr';
  if (ascii(0, 4) === 'caff') return 'audio/x-caf';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 3) === 'ID3') return 'audio/mpeg';
  // ISO-BMFF: [4 bayt boyut]['ftyp'][major brand]
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return 'image/heic';
    if (brand === 'avif') return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
    if (brand.startsWith('3g')) return 'video/3gpp';
    return 'video/mp4'; // isom/mp41/mp42/avc1/M4V …
  }
  return FALLBACK_CONTENT_TYPE;
}

/** Orig dosyanın ilk n baytı (Content-Type sniff) — safeFs gateway üzerinden. */
async function readHead(absPath: string, n = 32): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const s = createReadStream(absPath, { start: 0, end: n - 1 });
  for await (const chunk of s) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const SAFE_EXT_RE = /^[a-z0-9]{1,5}$/i;

interface ParsedUrl {
  variant: 'orig' | 'thumb' | 'transcoded';
  udid: string;
  fileId: string;
  search: URLSearchParams;
}

const FILEID_RE = /^[a-f0-9]{40}$/;

export function parseBackupUrl(rawUrl: string): ParsedUrl | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const variant = u.hostname;
  if (variant !== 'orig' && variant !== 'thumb' && variant !== 'transcoded') return null;
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [udid, fileId] = segments as [string, string];
  if (!FILEID_RE.test(fileId)) return null;
  if (!/^[a-f0-9-]{25,40}$/i.test(udid)) return null;
  return { variant: variant as ParsedUrl['variant'], udid, fileId, search: u.searchParams };
}

export function parseRange(
  rangeHeader: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const startStr = m[1] ?? '';
  const endStr = m[2] ?? '';
  let start: number;
  let end: number;
  if (startStr === '') {
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix)) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? size - 1 : parseInt(endStr, 10);
  }
  if (isNaN(start) || isNaN(end) || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

/**
 * Diskteki bir dosyayı (backup orig veya cache çıktısı) Range destekli stream'ler.
 * Büyük dosyalar (182MB HEVC transcode çıktısı gibi) belleğe TAM YÜKLENMEZ;
 * video seek de Range sayesinde çalışır.
 */
async function streamFileWithRange(
  absPath: string,
  request: Request,
  headers: Record<string, string>,
): Promise<Response> {
  let size: number;
  try {
    const s = await stat(absPath);
    if (!s.isFile()) return new Response('Not a file', { status: 404 });
    size = s.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const range = parseRange(request.headers.get('Range'), size);

  if (range) {
    const { start, end } = range;
    const nodeStream = createReadStream(absPath, { start, end });
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
    return new Response(webStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const nodeStream = createReadStream(absPath);
  const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}

// HEIC orig tam çözünürlük: Lightbox 1024 thumb yerine 4096 max-edge JPEG ister
// (?as=jpeg). Chromium HEIC decode edemez → decodeToJpeg + cache (variant=orig-jpeg).
const ORIG_JPEG_MAX_EDGE = 4096;

async function streamOrigAsJpeg(parsed: ParsedUrl, request: Request): Promise<Response> {
  const root = getRememberedRoot(parsed.udid);
  if (!root) return new Response('Backup not opened', { status: 404 });

  const mtimeMs = await getManifestMtimeMs(parsed.udid, root);
  const cached = await lookupCache(
    {
      udid: parsed.udid,
      manifestMtimeMs: mtimeMs,
      fileId: parsed.fileId,
      variant: 'orig-jpeg',
    },
    '.jpg',
    await sessionCacheDir(parsed.udid),
  );

  if (!cached.exists) {
    // BUG 5 — Lightbox orig-jpeg MISS: ilk geçişte decode. Geri-ileri'de (←→) aynı foto
    // tekrar istenince HIT olmalı (variant=orig-jpeg cache). MISS sürekliyse her geçiş
    // 4096px decode → fan coşar.
    logger.info(`[orig-jpeg] MISS decoding ${parsed.fileId}`);
    try {
      const absPath = await resolveBackupFile(parsed.udid, root, parsed.fileId, request.signal);
      if (!absPath) return new Response('Not found', { status: 404 });
      // Worker pool'da decode et (main thread bloke + fan olmasın). Aynı
      // concurrency semaphore'a tabi → Lightbox ±1 preload da fan'i coşturmaz.
      // request.signal: Lightbox'ta hızlı ←→ geçişte eski foto'nun fetch'i iptal
      // edilir → kuyruktaysa 4096px decode hiç başlamaz (thumb ile aynı desen).
      const jpeg = await getDecodePool().enqueue(
        { absPath, size: ORIG_JPEG_MAX_EDGE, kind: 'photo' },
        request.signal,
      );
      await writeCache(cached.absPath, jpeg, jpeg.length);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return new Response('Aborted', { status: 499 });
      }
      logger.error(
        `[protocol] orig?as=jpeg decode failed ${parsed.fileId}: ${(e as Error).message}`,
      );
      return new Response('JPEG decode failed', { status: 422 });
    }
  } else {
    logger.info(`[orig-jpeg] HIT ${parsed.fileId}`);
  }

  const data = await readCacheFile(cached.absPath);
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
  });
}

async function streamOrig(parsed: ParsedUrl, request: Request): Promise<Response> {
  if (parsed.search.get('as') === 'jpeg') return streamOrigAsJpeg(parsed, request);

  const root = getRememberedRoot(parsed.udid);
  if (!root) return new Response('Backup not opened', { status: 404 });
  let absPath: string | null;
  try {
    absPath = await resolveBackupFile(parsed.udid, root, parsed.fileId, request.signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return new Response('Aborted', { status: 499 });
    throw e;
  }
  if (!absPath) return new Response('Not found', { status: 404 });

  return streamFileWithRange(absPath, request, {
    'Content-Type': await resolveOrigContentType(absPath, parsed.search.get('ext')),
    'X-Content-Type-Options': 'nosniff',
  });
}

/**
 * Orig stream Content-Type: ?ext= (renderer biliyorsa) → uzantı tablosu; yoksa ya da
 * bilinmiyorsa magic byte. Okunamayan dosya → octet-stream (streamFileWithRange 404 döner).
 */
export async function resolveOrigContentType(absPath: string, ext: string | null): Promise<string> {
  if (ext && SAFE_EXT_RE.test(ext)) {
    const byExt = contentTypeForExt(ext);
    if (byExt !== FALLBACK_CONTENT_TYPE) return byExt;
  }
  try {
    return sniffContentType(await readHead(absPath));
  } catch {
    return FALLBACK_CONTENT_TYPE;
  }
}

async function streamThumb(parsed: ParsedUrl, request: Request): Promise<Response> {
  const root = getRememberedRoot(parsed.udid);
  if (!root) return new Response('Backup not opened', { status: 404 });

  const size = Math.max(
    64,
    Math.min(1024, parseInt(parsed.search.get('size') ?? '160', 10) || 160),
  );

  // Cache key: manifestMtime dahil (yedek yenilenince invalidate). Şifreli yedekte
  // cache oturum dizininde (kilitte silinir).
  const mtimeMs = await getManifestMtimeMs(parsed.udid, root);
  const cached = await lookupCache(
    {
      udid: parsed.udid,
      manifestMtimeMs: mtimeMs,
      fileId: parsed.fileId,
      variant: `thumb-${size}`,
    },
    '.jpg',
    await sessionCacheDir(parsed.udid),
  );

  if (!cached.exists) {
    // BUG 5 — cache MISS: decode gerekecek (fan kaynağı). Aynı foto 2. istekte HIT
    // görünmeli; MISS sürekliyse cache key tutarsız (manifestMtime memoize'i kontrol et).
    logger.info(`[thumb] MISS decoding ${parsed.fileId} size=${size}`);
    // Decode worker_threads HAVUZUNA gider — main thread BLOKE OLMAZ (scroll kilidi çözümü).
    // İptal: <img> unmount olunca (react-window görünürden çıkınca) browser fetch'i iptal eder
    // → request.signal abort → kuyruktaysa job çıkar, hiç decode edilmez.
    // Tip-bazlı routing worker içinde: kind=video → ffmpeg frame; foto → sharp/heic-convert.
    const isVideo = parsed.search.get('kind') === 'video';
    try {
      const absPath = await resolveBackupFile(parsed.udid, root, parsed.fileId, request.signal);
      if (!absPath) return new Response('Not found', { status: 404 });
      const jpeg = await getDecodePool().enqueue(
        { absPath, size, kind: isVideo ? 'video' : 'photo' },
        request.signal,
      );
      await writeCache(cached.absPath, jpeg, jpeg.length);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // Scroll'da görünürden çıktı — istemci zaten iptal etti, 499 benzeri sessiz dön.
        return new Response('Aborted', { status: 499 });
      }
      logger.error(
        `[protocol] thumb decode failed ${parsed.fileId} (video=${isVideo}): ${(e as Error).message}`,
      );
      return new Response('Thumb decode failed', { status: 422 });
    }
  } else {
    // BUG 5 — cache HIT: decode YOK, cache'ten stream. Scroll geri-ileri'de HIT
    // baskınsa fan susmalı (gereksiz decode yok).
    logger.info(`[thumb] HIT ${parsed.fileId} size=${size}`);
  }

  const data = await readCacheFile(cached.absPath);
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
  });
}

/**
 * Transcode çıktısını cache'te HAZIR et (yoksa üret). preheat (media IPC) ve
 * streamTranscoded AYNI yoldan geçer: aynı cache key (variant=transcoded-${to}) +
 * produceCacheFile in-flight dedupe → aynı dosya için TEK ffmpeg. ffmpeg geçici
 * path'e yazar, başarıda rename — öldürülen/başarısız çalışma HIT sayılmaz.
 * Döner: final cache path'i. Hata → throw (caller loglar / 422 döner).
 */
export async function ensureTranscodedCache(
  udid: string,
  root: string,
  fileId: string,
  to: 'mp4' | 'mp3',
  logTag = '[protocol]',
): Promise<string> {
  const mtimeMs = await getManifestMtimeMs(udid, root);
  const cached = await lookupCache(
    { udid, manifestMtimeMs: mtimeMs, fileId, variant: `transcoded-${to}` },
    `.${to}`,
    await sessionCacheDir(udid),
  );
  if (cached.exists) return cached.absPath;
  // Çözüm (şifreli yedekte) iptal edilmez: preheat ile stream aynı transcode'u paylaşır.
  const absPath = await resolveBackupFile(udid, root, fileId);
  if (!absPath) throw new Error(`Yedekte dosya yok: ${fileId}`);

  const t0 = Date.now();
  logger.info(`${logTag} transcode start ${fileId} → ${to}`);
  await produceCacheFile(cached.absPath, (tmpAbs) =>
    transcode({ inputAbs: absPath, outputAbs: tmpAbs, to }),
  );
  logger.info(`${logTag} transcode done ${fileId} → ${to} (${Date.now() - t0}ms)`);
  return cached.absPath;
}

/**
 * fileId → cache'lenmiş transcode (H.264 MP4 veya MP3). Cache miss'te ffmpeg
 * çalışır (182MB HEVC için 10-60sn — log'lanır), cache'ten Range destekli
 * stream edilir — büyük MP4 belleğe tam yüklenmez, video seek çalışır.
 * Cache key variant=transcoded-${to}.
 * protocol kapsamı: cache yazımı cache.ts/ffmpeg.ts üzerinden (fs gateway uyumlu).
 */
export async function streamTranscoded(parsed: ParsedUrl, request: Request): Promise<Response> {
  const root = getRememberedRoot(parsed.udid);
  if (!root) return new Response('Backup not opened', { status: 404 });

  const to: 'mp4' | 'mp3' = parsed.search.get('to') === 'mp3' ? 'mp3' : 'mp4';

  let cachedAbs: string;
  try {
    cachedAbs = await ensureTranscodedCache(parsed.udid, root, parsed.fileId, to);
  } catch (e) {
    logger.error(`[protocol] transcode failed ${parsed.fileId}: ${(e as Error).message}`);
    return new Response('Transcode failed', { status: 422 });
  }

  return streamFileWithRange(cachedAbs, request, {
    'Content-Type': to === 'mp4' ? 'video/mp4' : 'audio/mpeg',
    'Cache-Control': 'public, max-age=86400',
  });
}

export function registerBackupProtocol(): void {
  protocol.handle('backup', async (request) => {
    try {
      const parsed = parseBackupUrl(request.url);
      if (!parsed) return new Response('Bad URL', { status: 400 });
      // Kilitli şifreli yedeğin baytları (şifreli blob) servis edilmez — main tarafı zorlaması.
      // Kilidi açık yedek resolveBackupFile ile oturum dizinindeki çözülmüş dosyadan servis edilir.
      if (isUdidEncrypted(parsed.udid) && !isUdidUnlocked(parsed.udid)) {
        return new Response('Encrypted backup', { status: 403 });
      }
      switch (parsed.variant) {
        case 'orig':
          return await streamOrig(parsed, request);
        case 'thumb':
          return await streamThumb(parsed, request);
        case 'transcoded':
          return await streamTranscoded(parsed, request);
      }
    } catch (e) {
      logger.error(`[protocol] error: ${(e as Error).message}`);
      return new Response('Internal error', { status: 500 });
    }
  });
}
