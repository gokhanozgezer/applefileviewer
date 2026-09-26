import path from 'node:path';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';

let _cacheRoot: string | null = null;

export function getCacheRoot(): string {
  if (!_cacheRoot) _cacheRoot = path.join(app.getPath('userData'), 'cache');
  return _cacheRoot;
}

/** Test-only — cache root override (Electron app olmadan test için) */
export function _setCacheRootForTest(root: string): void {
  _cacheRoot = root;
  _acct = null; // muhasebe köke bağlı — yeni kökte lazy yeniden taranır
  _acctInit = null;
}

export async function ensureCacheRoot(): Promise<string> {
  const root = getCacheRoot();
  await fsp.mkdir(root, { recursive: true });
  return root;
}

// ─── Geçici (yazımı süren) cache dosyaları ──────────────────────────────────
// Her cache yazımı (decode buffer'ı, ffmpeg transcode'u) ÖNCE benzersiz geçici ada
// yazılır, bitince final ada atomik rename edilir. Final path var = içerik TAM.
// Eskiden ffmpeg doğrudan final path'e yazıyordu: öldürülen/başarısız çalışma yarım
// dosya bırakıyor, lookupCache onu HIT sayıyordu → video cache temizlenene dek bozuk.
// Ad biçimi: <key>.tmp-<hex><ext> — uzantı SONDA kalır (ffmpeg çıktı formatını
// uzantıdan çıkarır; thumbnail'de .format() verilmiyor).

const TEMP_RE = /\.tmp-[0-9a-f]{12}(\.[A-Za-z0-9]+)?$/;

/** Bu dosya adı yazımı süren (veya yarım kalmış) bir geçici cache dosyası mı? */
export function isTempCacheName(name: string): boolean {
  return TEMP_RE.test(name);
}

/** Final cache path'i için aynı dizinde benzersiz geçici path (rename aynı volume'de atomik). */
export function tempPathFor(absPath: string): string {
  const ext = path.extname(absPath);
  const base = absPath.slice(0, absPath.length - ext.length);
  return `${base}.tmp-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

/**
 * Geçici dosyayı final ada taşı. Windows'ta hedef açıksa (başka istek stream'liyor)
 * rename EPERM atabilir — hedef zaten varsa başka bir yazım tamamlamış demektir:
 * geçiciyi sil, başarı say. Aksi halde geçiciyi silip hatayı ilet.
 */
async function commitTemp(tmpAbs: string, absPath: string): Promise<void> {
  try {
    await fsp.rename(tmpAbs, absPath);
  } catch (e) {
    await fsp.unlink(tmpAbs).catch(() => undefined);
    if (!fs.existsSync(absPath)) throw e;
  }
}

/** Yetim geçici dosya eşiği — en uzun üretim (10 dk transcode timeout) + pay. */
export const TEMP_ORPHAN_MS = 60 * 60 * 1000; // 1 saat

export interface CacheKeyInput {
  udid: string;
  manifestMtimeMs: number;
  fileId: string;
  variant: string; // 'orig' | 'thumb-256' | 'transcoded-mp4'
}

export function cacheKeyFor(input: CacheKeyInput): string {
  return crypto
    .createHash('sha1')
    .update(`${input.udid}|${input.manifestMtimeMs}|${input.fileId}|${input.variant}`)
    .digest('hex');
}

export interface CachedFile {
  key: string;
  absPath: string;
  exists: boolean;
}

/**
 * privateRoot: şifreli yedek oturumunun cache dizini (<afv-dec-*>/cache) — türetilmiş düz
 * metin (thumbnail/transcode/orig-jpeg) userData/cache'e DÜŞMEZ, kilitte oturumla silinir.
 * Özel köke yazımlar bayt muhasebesi/eviction dışındadır (dizin bütün olarak silinir).
 */
export async function lookupCache(
  input: CacheKeyInput,
  ext: string,
  privateRoot?: string | null,
): Promise<CachedFile> {
  let root: string;
  if (privateRoot) {
    root = privateRoot;
    await fsp.mkdir(root, { recursive: true });
  } else {
    root = await ensureCacheRoot();
  }
  const key = cacheKeyFor(input);
  const absPath = path.join(root, `${key}${ext}`);
  return { key, absPath, exists: fs.existsSync(absPath) };
}

/** 5GB hard cap. */
export const CACHE_HARD_CAP_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Cap aşılınca eviction toplamı bu orana (cap × oran) indirir: dolu cache'te her
 * yazım yeniden tarama tetiklemesin (histerezis) — bir tarama sonraki birçok yazıma yer açar.
 */
export const CACHE_EVICT_TARGET_RATIO = 0.9;

// ─── Bayt muhasebesi ────────────────────────────────────────────────────────
// Eskiden HER yazım tek global kuyrukta readdir + tüm dosyaların stat'ını yapıyordu →
// cache büyüdükçe thumbnail grid yavaşlıyordu. Artık:
//  - committed: diskteki final cache dosyalarının toplamı (ilk kullanımda TEK tarama
//    ile başlatılır; yazım/evict/clear'da güncellenir, her eviction taramasında
//    diskle yeniden eşitlenir).
//  - pending: yazımı süren (rezerve edilmiş) baytlar.
// Hızlı yol: committed + pending + incoming ≤ cap → rezerve et, KUYRUKSUZ yaz.
// Aksi halde eviction kuyruğu: süren yazımların bitmesini bekler, tarar, en eskileri
// siler, SONRA rezerve eder. Kuyrukta bekleyen varken (gated > 0) hızlı yol kapalı —
// böylece eşzamanlı yazımlar cap'i aşamaz (eviction yarışı yok).

interface CacheAccounting {
  root: string;
  committed: number;
  pending: number;
}

let _acct: CacheAccounting | null = null;
let _acctInit: Promise<CacheAccounting> | null = null;
let _scanCount = 0;
/** Süren writeCache yazımları (eviction taraması öncesi beklenir). */
const inFlight = new Set<Promise<void>>();
let evictQueue: Promise<unknown> = Promise.resolve();
let gated = 0;

/** Test-only — kaç kez tam dizin taraması yapıldı. */
export function _getCacheScanCountForTest(): number {
  return _scanCount;
}

interface ScannedEntry {
  abs: string;
  size: number;
  mtimeMs: number;
}

/** Cache kökündeki final dosyalar (geçici dosyalar HARİÇ — yazımı süren/yetim). */
async function scanCacheDir(root: string): Promise<ScannedEntry[]> {
  _scanCount += 1;
  const entries = await fsp.readdir(root);
  const stats = await Promise.all(
    entries.map(async (name) => {
      // Yazımı süren geçici dosya evict edilmez (rename'i ENOENT ile düşer);
      // yetimleri pruneCache toplar.
      if (isTempCacheName(name)) return null;
      const abs = path.join(root, name);
      try {
        const s = await fsp.stat(abs);
        return s.isFile() ? { abs, size: s.size, mtimeMs: s.mtimeMs } : null;
      } catch {
        return null;
      }
    }),
  );
  return stats.filter((s): s is ScannedEntry => !!s);
}

/** Muhasebe (lazy, tek tarama; eşzamanlı çağıranlar aynı init'e bağlanır). */
function getAccounting(): Promise<CacheAccounting> {
  const root = getCacheRoot();
  if (_acct && _acct.root === root) return Promise.resolve(_acct);
  if (!_acctInit) {
    const init = (async () => {
      await ensureCacheRoot();
      const valid = await scanCacheDir(root);
      const a: CacheAccounting = {
        root,
        committed: valid.reduce((sum, e) => sum + e.size, 0),
        pending: 0,
      };
      if (getCacheRoot() === root) _acct = a;
      return a;
    })();
    _acctInit = init;
    void init
      .catch(() => undefined)
      .finally(() => {
        if (_acctInit === init) _acctInit = null;
      });
  }
  return _acctInit;
}

/**
 * Eviction işini kuyruğa al: önce süren yazımlar biter (geçici dosyaları sayılamaz),
 * sonra fn. Kuyrukta iş varken hızlı yol kapalı (gated).
 */
function enqueueEvict<T>(fn: () => Promise<T>): Promise<T> {
  gated += 1;
  const task = evictQueue
    .then(async () => {
      await Promise.allSettled([...inFlight]);
      return fn();
    })
    .finally(() => {
      gated -= 1;
    });
  evictQueue = task.catch(() => undefined);
  return task;
}

/**
 * Tara + gerekirse en eskileri sil: committed + pending + incoming > maxBytes ise
 * toplam targetBytes'a inene dek siler. Muhasebeyi diskle yeniden eşitler.
 */
async function scanAndEvict(
  incomingBytes: number,
  maxBytes: number,
  targetBytes: number,
  acct?: CacheAccounting,
): Promise<{ removed: number; freedBytes: number }> {
  // acct verilirse o köke bağlı kalır (kuyrukta beklerken kök değişse de — test izolasyonu)
  const a = acct ?? (await getAccounting());
  await fsp.mkdir(a.root, { recursive: true });
  const valid = await scanCacheDir(a.root);
  let total = valid.reduce((sum, e) => sum + e.size, 0);
  const extra = a.pending + incomingBytes;
  let removed = 0;
  let freed = 0;

  // Yeni dosya DAHİL toplam cap'i aşıyorsa, en eski'leri sil
  if (total + extra > maxBytes) {
    valid.sort((x, y) => x.mtimeMs - y.mtimeMs); // en eski önce
    for (const e of valid) {
      if (total + extra <= targetBytes) break;
      try {
        await fsp.unlink(e.abs);
        removed += 1;
        freed += e.size;
        total -= e.size;
      } catch {
        /* ignore */
      }
    }
  }
  a.committed = total;
  return { removed, freedBytes: freed };
}

/**
 * Cache + yeni dosya toplam > cap ise, YENİ YAZIMDAN ÖNCE en eski dosyaları sil.
 * incomingBytes: yazılacak yeni dosyanın boyutu (toplam hesabına dahil).
 * En eski = mtime (yazıldığı an). NTFS atime güvenilmez, mtime proxy.
 * Eviction kuyruğundan geçer (süren yazımlar önce biter) ve muhasebeyi eşitler.
 */
export function evictForIncoming(
  incomingBytes: number,
  maxBytes = CACHE_HARD_CAP_BYTES,
): Promise<{
  removed: number;
  freedBytes: number;
}> {
  return enqueueEvict(() => scanAndEvict(incomingBytes, maxBytes, maxBytes));
}

function evictTarget(maxBytes: number): number {
  return Math.floor(maxBytes * CACHE_EVICT_TARGET_RATIO);
}

/**
 * Cache dosyasını oku (userData/cache — backup değil).
 * protocol.ts'in doğrudan fsp import etmesini önler (ESLint no-restricted-imports).
 */
export async function readCacheFile(absPath: string): Promise<Buffer> {
  return fsp.readFile(absPath);
}

/**
 * Bir cache dosyası absPath'inin DİZİNİNİ oluştur (recursive).
 * ffmpeg.ts fs'e dokunamaz (ESLint no-restricted-imports) — produceCacheFile
 * üretimden ÖNCE bunu çağırır.
 */
export async function ensureCacheDir(absPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
}

/** Commit sonrası committed'a ekle; cap aşıldı mı (boyutu önceden bilinmeyen stream/ffmpeg). */
function addCommitted(a: CacheAccounting, bytes: number, maxBytes: number): boolean {
  a.committed += bytes;
  return a.committed + a.pending > maxBytes;
}

/** Süren yazımın rezervasyonu — commit anında pending'den committed'a taşınır (çift sayım yok). */
interface Reservation {
  bytes: number;
}

async function doWriteCache(
  a: CacheAccounting,
  absPath: string,
  data: Buffer | NodeJS.ReadableStream,
  res: Reservation,
  maxBytes: number,
): Promise<void> {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  // Geçici ada yaz → rename: eşzamanlı okuyucu (lookupCache exists → readCacheFile)
  // yarım dosya görmez; hata/iptalde yarım dosya final path'te kalmaz.
  const tmpAbs = tempPathFor(absPath);
  let written = 0;
  try {
    if (Buffer.isBuffer(data)) {
      await fsp.writeFile(tmpAbs, data);
      written = data.length;
    } else {
      // pipeline: kaynak stream hatası da yakalanır (eski .pipe yalnız hedef hatasını dinliyordu)
      await pipeline(data, fs.createWriteStream(tmpAbs));
      written = (await fsp.stat(tmpAbs)).size;
    }
  } catch (e) {
    await fsp.unlink(tmpAbs).catch(() => undefined);
    throw e;
  }
  await commitTemp(tmpAbs, absPath);
  a.pending -= res.bytes;
  res.bytes = 0;
  if (addCommitted(a, written, maxBytes)) {
    // Ateşle-unut: bu yazım hâlâ inFlight'ta — beklersek eviction kuyruğu kendini bekler.
    void enqueueEvict(() => scanAndEvict(0, maxBytes, evictTarget(maxBytes), a)).catch(
      () => undefined,
    );
  }
}

/** Rezerve et + yazımı başlat (SENKRON kayıt: kontrol ile rezervasyon arasında await yok). */
function startWrite(
  a: CacheAccounting,
  absPath: string,
  data: Buffer | NodeJS.ReadableStream,
  incoming: number,
  maxBytes: number,
): Promise<void> {
  a.pending += incoming;
  const res: Reservation = { bytes: incoming };
  const p: Promise<void> = doWriteCache(a, absPath, data, res, maxBytes).finally(() => {
    a.pending -= res.bytes; // hata yolunda commit olmadı → rezervasyonu bırak
    inFlight.delete(p);
  });
  inFlight.add(p);
  return p;
}

/**
 * Cache'e yaz. 5GB cap ÖNCE-kontrol (yaz-sonra-temizle DEĞİL): bellek-içi toplamla
 * sığıyorsa doğrudan yazar (tarama/kuyruk yok); sığmıyorsa eviction kuyruğu
 * tarar + en eskileri siler, sonra yazar. data Buffer veya ReadableStream.
 */
export async function writeCache(
  absPath: string,
  data: Buffer | NodeJS.ReadableStream,
  sizeHint?: number,
  maxBytes = CACHE_HARD_CAP_BYTES,
): Promise<void> {
  if (!isUnderManagedRoot(absPath)) return writePrivate(absPath, data);
  const incoming = sizeHint ?? (Buffer.isBuffer(data) ? data.length : 0);
  const a = await getAccounting();
  if (gated === 0 && a.committed + a.pending + incoming <= maxBytes) {
    return startWrite(a, absPath, data, incoming, maxBytes);
  }
  // Yazım kuyruğun İÇİNDE başlatılır (sonraki kuyruk işi onu inFlight'ta görür),
  // ama tamamlanması beklenmez — kuyruk yalnız tarama/eviction'ı serileştirir.
  const started = await enqueueEvict(async () => {
    await scanAndEvict(incoming, maxBytes, evictTarget(maxBytes), a);
    return { p: startWrite(a, absPath, data, incoming, maxBytes) };
  });
  return started.p;
}

/** absPath yönetilen cache kökü (userData/cache) altında mı — değilse özel (oturum) cache. */
function isUnderManagedRoot(absPath: string): boolean {
  const norm = (p: string): string => {
    const r = path.resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  const root = norm(getCacheRoot());
  const target = norm(absPath);
  return target === root || target.startsWith(root + path.sep);
}

/** Özel (oturum) cache yazımı: geçici ad → atomik rename, muhasebe/eviction yok. */
async function writePrivate(absPath: string, data: Buffer | NodeJS.ReadableStream): Promise<void> {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmpAbs = tempPathFor(absPath);
  try {
    if (Buffer.isBuffer(data)) await fsp.writeFile(tmpAbs, data);
    else await pipeline(data, fs.createWriteStream(tmpAbs));
  } catch (e) {
    await fsp.unlink(tmpAbs).catch(() => undefined);
    throw e;
  }
  await commitTemp(tmpAbs, absPath);
}

// Final path → süren üretim. preheat (media IPC) ve protocol streamTranscoded aynı
// dosyayı aynı anda transcode etmesin: ikinci çağıran ilkinin promise'ine bağlanır.
const producing = new Map<string, Promise<void>>();

/**
 * Harici bir üreticinin (ffmpeg) cache dosyası yazması: producer GEÇİCİ path'e yazar,
 * başarıda final ada atomik rename, hatada geçici silinir. Aynı absPath için eşzamanlı
 * çağrılar TEK üretime bağlanır (in-flight dedupe). Üretim sonrası 5GB cap kontrolü
 * bellek-içi toplamla yapılır; aşıldıysa eviction kuyruğundan geçer (boyut önceden
 * bilinmediği için sonradan).
 */
export function produceCacheFile(
  absPath: string,
  producer: (tmpAbs: string) => Promise<void>,
  maxBytes = CACHE_HARD_CAP_BYTES,
): Promise<void> {
  const existing = producing.get(absPath);
  if (existing) return existing;

  const task = (async () => {
    const managed = isUnderManagedRoot(absPath);
    const a = managed ? await getAccounting() : null;
    await ensureCacheDir(absPath);
    const tmpAbs = tempPathFor(absPath);
    let size = 0;
    try {
      await producer(tmpAbs);
      size = (await fsp.stat(tmpAbs)).size;
    } catch (e) {
      await fsp.unlink(tmpAbs).catch(() => undefined);
      throw e;
    }
    await commitTemp(tmpAbs, absPath);
    if (a && addCommitted(a, size, maxBytes)) {
      // cap temizliği başarısız olsa da üretim başarılı
      await enqueueEvict(() => scanAndEvict(0, maxBytes, evictTarget(maxBytes), a)).catch(
        () => undefined,
      );
    }
  })().finally(() => {
    producing.delete(absPath);
  });
  producing.set(absPath, task);
  return task;
}

/** Test/teşhis — şu an üretimi süren cache path'i var mı. */
export function isProducing(absPath: string): boolean {
  return producing.has(absPath);
}

/**
 * Bir dizindeki dosyaların sayı/boyut istatistiği (Settings cache paneli).
 * fs erişimi bilinçli olarak burada — maintenance IPC'si fs gateway'e giremez.
 */
export async function statsForDir(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  try {
    for (const name of await fsp.readdir(root)) {
      try {
        const s = await fsp.stat(path.join(root, name));
        if (s.isFile()) {
          files += 1;
          bytes += s.size;
        }
      } catch {
        /* atla */
      }
    }
  } catch {
    /* dizin yok — 0 */
  }
  return { files, bytes };
}

/**
 * Dizindeki tüm dosyaları sil (hata-toleranslı; açık/kilitli dosya atlanır).
 * Yazımı süren geçici cache dosyaları (isTempCacheName) ATLANIR — silinirse süren
 * transcode/decode'un rename'i ENOENT ile düşer; yetimleri pruneCache toplar.
 */
export async function clearDirFiles(
  root: string,
): Promise<{ removedFiles: number; freedBytes: number }> {
  let removedFiles = 0;
  let freedBytes = 0;
  try {
    for (const name of await fsp.readdir(root)) {
      if (isTempCacheName(name)) continue;
      const abs = path.join(root, name);
      try {
        const s = await fsp.stat(abs);
        if (!s.isFile()) continue;
        await fsp.unlink(abs);
        removedFiles += 1;
        freedBytes += s.size;
      } catch {
        /* açık dosya — atla */
      }
    }
  } catch {
    /* dizin yok */
  }
  // Cache kökü temizlendiyse bellek-içi toplamı düş (sonraki eviction taraması eşitler).
  if (_acct && path.resolve(_acct.root) === path.resolve(root)) {
    _acct.committed = Math.max(0, _acct.committed - freedBytes);
  }
  return { removedFiles, freedBytes };
}

/** Cache TTL — bu yaştan eski dosyalar startup'ta silinir. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

export interface PruneResult {
  removedTtl: number;
  removedCap: number;
  freedBytes: number;
}

/**
 * Startup cache temizliği:
 *  1. TTL: mtime CACHE_TTL_MS'den eski cache dosyalarını sil.
 *  2. Cap: kalan toplam > 5GB ise en eski'leri sil (evictForIncoming(0)).
 *
 * NTFS atime güvenilmez → mtime (yazıldığı an) proxy.
 * Hata-toleranslı: tek dosya silinemezse atla, devam et.
 */
export async function pruneCache(ttlMs = CACHE_TTL_MS, now = Date.now()): Promise<PruneResult> {
  const root = await ensureCacheRoot();
  const entries = await fsp.readdir(root);
  let removedTtl = 0;
  let freedBytes = 0;

  for (const name of entries) {
    const abs = path.join(root, name);
    try {
      const s = await fsp.stat(abs);
      if (!s.isFile()) continue;
      // Geçici dosya: yazımı sürüyor olabilir → yalnız TEMP_ORPHAN_MS'den eskiyse
      // (çöken/öldürülen üretimden kalan yetim) sil.
      const limit = isTempCacheName(name) ? Math.min(ttlMs, TEMP_ORPHAN_MS) : ttlMs;
      if (now - s.mtimeMs > limit) {
        await fsp.unlink(abs);
        removedTtl += 1;
        freedBytes += s.size;
      }
    } catch {
      /* ignore — yarış/erişim hatası, atla */
    }
  }

  // TTL sonrası kalan için 5GB cap (incoming 0 → mevcut toplam cap'i aşıyorsa böl).
  const capResult = await evictForIncoming(0);
  freedBytes += capResult.freedBytes;

  return { removedTtl, removedCap: capResult.removed, freedBytes };
}

/**
 * app.whenReady içinde çağrılır. pruneCache'i fire-and-forget çalıştırır,
 * sonucu loglar. Hata startup'ı bloke etmez.
 */
export function scheduleCacheCleanup(log: (msg: string) => void = () => undefined): void {
  void pruneCache()
    .then((r) => {
      const mb = (r.freedBytes / (1024 * 1024)).toFixed(1);
      log(
        `[cache cleanup] prune complete — TTL removed=${r.removedTtl}, cap removed=${r.removedCap}, freed=${mb}MB`,
      );
    })
    .catch((err) => {
      log(`[cache cleanup] prune failed: ${err instanceof Error ? err.message : String(err)}`);
    });
}
