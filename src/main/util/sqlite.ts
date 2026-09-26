// util/sqlite — SQLite gateway: salt-okunur + tmp snapshot + mtime cache key.
// Spec §2 invariants #4 + #5 zincirini zorlar.

import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import { createReadStream, stat } from '@main/safeFs';

export interface OpenOptions {
  udid: string;
  absPath: string;
}

/**
 * SQLite tmp snapshot dizini. Cache key (sha1) bazlı dosya adıyla bu dizine yazılır.
 * Test'ler buradan dosya sayısı snapshot'ı alır (kopya counter'ı).
 * Tasarım A: her unique (udid + dbAbsPath + dbMtimeMs) ayrı dosya — immutable cache.
 */
export const TMP_CACHE_DIR = path.join(os.tmpdir(), 'applefileviewer', 'sqlite');

/**
 * Cache key: sha1(udid + '|' + dbAbsPath + '|' + dbMtimeMs).
 * Pure function — golden value test'i destekler.
 */
export function computeCacheKey(udid: string, dbAbsPath: string, dbMtimeMs: number): string {
  return crypto.createHash('sha1').update(`${udid}|${dbAbsPath}|${dbMtimeMs}`).digest('hex');
}

// In-memory cache map: key → tmp path. Design A (immutable cache, sha1=dosya adı).
const cacheMap = new Map<string, string>();

// Aynı key için süren kopya (in-flight dedupe). Global arama + liste görünümü
// aynı anda cache MISS görürse İKİSİ de aynı hedefe yazıp açıyordu → "database
// disk image is malformed". Artık ikinci çağıran ilk kopyanın promise'ini bekler.
const inFlight = new Map<string, Promise<string>>();
/** Süren kopyaların hedef snapshot path'leri — prune bunlara dokunmaz. */
const inFlightPaths = new Set<string>();

/**
 * Snapshot kullanımda mı (cacheMap'te veya kopyası sürüyor)? Prune bunları silmez:
 * fire-and-forget startup prune'u, yeniden kullanılan (>TTL) bir snapshot'ı açılırken
 * silip "unable to open database" üretebiliyordu.
 */
function isSnapshotInUse(abs: string): boolean {
  if (inFlightPaths.has(abs)) return true;
  for (const p of cacheMap.values()) if (p === abs) return true;
  return false;
}

/** Yeniden kullanımda mtime'ı tazele — TTL süpürmesi kullanılan snapshot'ı "eski" saymasın. */
async function touch(abs: string): Promise<void> {
  const now = new Date();
  await fsp.utimes(abs, now, now).catch(() => undefined);
}

/** Kopya sırasında yazılan geçici dosya soneki — prune boyut süpürmesi bunlara dokunmaz. */
const PART_SUFFIX = '.part';

function isPartName(name: string): boolean {
  return name.endsWith(PART_SUFFIX);
}

/** Dosya boyutu; yoksa/okunamazsa null (tmp snapshot — gateway kapsamı dışı, os.tmpdir). */
async function sizeOrNull(absPath: string): Promise<number | null> {
  try {
    const s = await fsp.stat(absPath);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

/**
 * Source'u benzersiz geçici ada kopyalar, sonra final ada atomik rename eder.
 * Hata olursa yarım dosya silinir (bir sonraki çağrı onu HIT sanmasın).
 * Döner: açılacak snapshot path'i (normalde tmpPath).
 */
async function materializeSnapshot(
  absPath: string,
  tmpPath: string,
  sourceSize: number,
): Promise<string> {
  await fsp.mkdir(TMP_CACHE_DIR, { recursive: true });

  // Uygulama yeniden başladı (cacheMap boş) ama snapshot diskte: key mtime içerdiğinden
  // aynı boyut = aynı içerik. Boyut farklıysa (eski sürümün yarım kopyası) yeniden kopyala.
  if ((await sizeOrNull(tmpPath)) === sourceSize) {
    await touch(tmpPath);
    return tmpPath;
  }

  const partPath = `${tmpPath}.${crypto.randomBytes(6).toString('hex')}${PART_SUFFIX}`;
  try {
    const readStream = createReadStream(absPath); // safeFs gateway — invariant #4 4. sub-bullet uyumlu
    const writeStream = fs.createWriteStream(partPath);
    await pipeline(readStream, writeStream);
  } catch (e) {
    await fsp.unlink(partPath).catch(() => undefined);
    throw e;
  }

  try {
    await fsp.rename(partPath, tmpPath);
    return tmpPath;
  } catch (renameErr) {
    // Windows: hedef başka bir bağlantıda açıksa (SQLite FILE_SHARE_DELETE vermez)
    // rename EPERM/EACCES atar. Hedef zaten doğru boyuttaysa onu kullan; değilse
    // tam kopyalanmış .part dosyasının kendisini aç (prune TTL ile toplar).
    if ((await sizeOrNull(tmpPath)) === sourceSize) {
      await fsp.unlink(partPath).catch(() => undefined);
      return tmpPath;
    }
    if ((await sizeOrNull(partPath)) === sourceSize) return partPath;
    await fsp.unlink(partPath).catch(() => undefined);
    throw renameErr;
  }
}

/**
 * Source SQLite dosyasını tmp'ye kopyalar (safeFs.createReadStream gateway üzerinden),
 * { readonly: true, fileMustExist: true } ile açar ve döner.
 *
 * - mtime cache: aynı (udid, absPath, mtime) için tek kopya (Design A).
 * - Eşzamanlı MISS'ler tek kopyaya bağlanır (in-flight dedupe); kopya benzersiz
 *   geçici ada yazılıp atomik rename edilir — yarım dosya asla açılmaz.
 * - Gateway akışı: source READ safeFs.createReadStream'den (invariant #4 4. sub-bullet).
 *   fsp.copyFile ÇAĞRISI YOK — stream-to-stream pipeline.
 * - Sidecar yok: source'a hiç connection açılmıyor, tmp'de işlemler.
 */
export async function openReadOnlyTmp(opts: OpenOptions): Promise<Database.Database> {
  const { udid, absPath } = opts;

  // Source mtime gateway üzerinden (read scope herhangi bir path için açık)
  const sourceStat = await stat(absPath);
  const mtimeMs = sourceStat.mtimeMs;

  const key = computeCacheKey(udid, absPath, mtimeMs);
  const ext = path.extname(absPath) || '.db';
  const tmpPath = path.join(TMP_CACHE_DIR, `${key}${ext}`);

  // Cache HIT: map'te varsa + disk'te varsa kopyalamayı atla
  const cachedPath = cacheMap.get(key);
  if (cachedPath && fs.existsSync(cachedPath)) {
    void touch(cachedPath);
    return new Database(cachedPath, { readonly: true, fileMustExist: true });
  }

  // Cache MISS: aynı key için süren kopya varsa ona bağlan, yoksa başlat.
  let pending = inFlight.get(key);
  if (!pending) {
    inFlightPaths.add(tmpPath);
    pending = materializeSnapshot(absPath, tmpPath, sourceStat.size)
      .then((p) => {
        cacheMap.set(key, p);
        return p;
      })
      .finally(() => {
        inFlight.delete(key);
        inFlightPaths.delete(tmpPath);
      });
    inFlight.set(key, pending);
  }
  const snapshotPath = await pending;

  return new Database(snapshotPath, { readonly: true, fileMustExist: true });
}

/**
 * Şifreli yedekten ÇÖZÜLMÜŞ bir SQLite dosyasını yerinde, salt-okunur açar.
 * Çözülmüş dosya zaten özel bir kopyadır (os.tmpdir()/afv-dec-* oturum dizini —
 * yedeğin kendisi DEĞİL); TMP_CACHE_DIR'e ikinci bir düz metin kopya yazılmaz.
 * -wal/-shm yan dosyaları da oturum dizininde oluşur ve kilitte onunla silinir.
 */
export function openReadOnlyInPlace(absPath: string): Database.Database {
  return new Database(absPath, { readonly: true, fileMustExist: true });
}

// ─── Tmp snapshot temizliği ──────────────────────────────────────────────────
// Snapshot'lar kişisel veri DB'lerinin düz kopyaları — süresiz tmp'de kalmaları
// hem disk sızıntısı hem gizlilik sorunu. Key mtime içerdiğinden yenilenen bir
// yedek eski snapshot'ı yetim bırakır; tek toplayıcı burası.

const TMP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
const TMP_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export interface TmpPruneResult {
  removed: number;
  kept: number;
  freedBytes: number;
}

/**
 * TMP_CACHE_DIR'deki snapshot'ları temizler: TTL'i dolanlar + toplam boyut
 * sınırını aşarsa en eskiler. Açık dosya (Windows EBUSY) sessizce atlanır —
 * bir sonraki başlangıçta tekrar denenir. Startup'ta fire-and-forget çağrılır.
 */
export async function pruneTmpSqliteCache(
  opts: { ttlMs?: number; maxBytes?: number; now?: number } = {},
): Promise<TmpPruneResult> {
  const ttlMs = opts.ttlMs ?? TMP_TTL_MS;
  const maxBytes = opts.maxBytes ?? TMP_MAX_BYTES;
  const now = opts.now ?? Date.now();

  let names: string[];
  try {
    names = await fsp.readdir(TMP_CACHE_DIR);
  } catch {
    return { removed: 0, kept: 0, freedBytes: 0 }; // dizin yok — temiz
  }

  const entries: { abs: string; mtimeMs: number; size: number }[] = [];
  for (const name of names) {
    const abs = path.join(TMP_CACHE_DIR, name);
    try {
      const s = await fsp.stat(abs);
      if (s.isFile()) entries.push({ abs, mtimeMs: s.mtimeMs, size: s.size });
    } catch {
      /* stat edilemeyen girdi atlanır */
    }
  }

  let removed = 0;
  let freedBytes = 0;
  const survivors: typeof entries = [];

  const tryRemove = async (e: (typeof entries)[number]): Promise<boolean> => {
    // Kullanımdaki snapshot (cacheMap / süren kopya) silinmez — kontrol unlink'ten
    // hemen önce (readdir/stat sırasında yeniden kullanıma alınmış olabilir).
    if (isSnapshotInUse(e.abs)) return false;
    try {
      await fsp.unlink(e.abs);
      removed += 1;
      freedBytes += e.size;
      // Map'te bu path'i işaret eden girdiler artık geçersiz
      for (const [key, p] of cacheMap) {
        if (p === e.abs) cacheMap.delete(key);
      }
      return true;
    } catch {
      return false; // açık dosya (EBUSY) — sonraki prune'a bırak
    }
  };

  // 1. TTL süpürmesi
  for (const e of entries) {
    if (now - e.mtimeMs > ttlMs) {
      if (!(await tryRemove(e))) survivors.push(e);
    } else {
      survivors.push(e);
    }
  }

  // 2. Boyut sınırı — en eskiden başlayarak. Süren kopyanın .part dosyası
  // (in-flight) silinmez — silinirse rename ENOENT ile düşer; yetimleri TTL toplar.
  let total = survivors.reduce((sum, e) => sum + e.size, 0);
  if (total > maxBytes) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const e of survivors) {
      if (total <= maxBytes) break;
      if (isPartName(e.abs)) continue;
      if (await tryRemove(e)) total -= e.size;
    }
  }

  return { removed, kept: entries.length - removed, freedBytes };
}

/** Test-only — in-memory cache map + disk tmp dizinini temizler (testler arası izolasyon). */
export function _resetTmpCacheForTest(): void {
  // Map temizle
  cacheMap.clear();
  inFlight.clear();
  inFlightPaths.clear();
  // Disk temizle — testler arası izolasyon (map + disk her ikisi zorunlu)
  try {
    fs.rmSync(TMP_CACHE_DIR, { recursive: true, force: true });
  } catch {
    /* ignore — silinemeyen dosya kritik path değil */
  }
}

/** Re-export: better-sqlite3 Database type alias. Caller'lar bu type'ı kullanır; better-sqlite3'ü doğrudan import etmez. */
export type ReadOnlyDb = Database.Database;
