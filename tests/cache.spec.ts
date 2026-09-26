import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import {
  cacheKeyFor,
  lookupCache,
  writeCache,
  clearDirFiles,
  _getCacheScanCountForTest,
  evictForIncoming,
  pruneCache,
  _setCacheRootForTest,
  CACHE_HARD_CAP_BYTES,
  CACHE_TTL_MS,
  produceCacheFile,
  isProducing,
  isTempCacheName,
  tempPathFor,
  TEMP_ORPHAN_MS,
} from '@main/cache';
import { setBackupRoot, getBackupRoot } from '@main/safeFs';
import { getTmpRoot } from './setup';

describe('cache', () => {
  let cacheRoot: string;

  beforeEach(() => {
    cacheRoot = path.join(getTmpRoot(), 'cache');
    _setCacheRootForTest(cacheRoot);
  });

  it('cacheKeyFor deterministik sha1 (udid+mtime+fileId+variant)', () => {
    const a = cacheKeyFor({ udid: 'U', manifestMtimeMs: 100, fileId: 'F', variant: 'thumb-256' });
    const b = cacheKeyFor({ udid: 'U', manifestMtimeMs: 100, fileId: 'F', variant: 'thumb-256' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{40}$/);
  });

  it('cache key variant değişince farklı', () => {
    const orig = cacheKeyFor({ udid: 'U', manifestMtimeMs: 100, fileId: 'F', variant: 'orig' });
    const thumb = cacheKeyFor({
      udid: 'U',
      manifestMtimeMs: 100,
      fileId: 'F',
      variant: 'thumb-256',
    });
    expect(orig).not.toBe(thumb);
  });

  it('cache key mtime değişince farklı (yedek yenilenince invalidate)', () => {
    const old = cacheKeyFor({ udid: 'U', manifestMtimeMs: 100, fileId: 'F', variant: 'orig' });
    const fresh = cacheKeyFor({ udid: 'U', manifestMtimeMs: 200, fileId: 'F', variant: 'orig' });
    expect(old).not.toBe(fresh);
  });

  it('writeCache + lookupCache round-trip', async () => {
    const { absPath } = await lookupCache(
      { udid: 'U', manifestMtimeMs: 100, fileId: 'F', variant: 'thumb-256' },
      '.jpg',
    );
    await writeCache(absPath, Buffer.from('test-data'));
    const after = await lookupCache(
      { udid: 'U', manifestMtimeMs: 100, fileId: 'F', variant: 'thumb-256' },
      '.jpg',
    );
    expect(after.exists).toBe(true);
    expect(fs.readFileSync(absPath, 'utf8')).toBe('test-data');
  });

  it('5GB hard cap — yeni yazım ÖNCE eski siler (toplam ≤ cap)', async () => {
    // Küçük cap ile test (1KB)
    const SMALL_CAP = 1024;
    fs.mkdirSync(cacheRoot, { recursive: true });
    // 3 eski dosya, her biri 400 byte (toplam 1200 > 1024)
    const old1 = path.join(cacheRoot, 'old1.bin');
    const old2 = path.join(cacheRoot, 'old2.bin');
    fs.writeFileSync(old1, Buffer.alloc(400));
    // old1 daha eski olsun (mtime)
    const past = Date.now() - 10000;
    fs.utimesSync(old1, new Date(past), new Date(past));
    fs.writeFileSync(old2, Buffer.alloc(400));

    // 400 byte yeni gelecek: 800 (mevcut) + 400 = 1200 > 1024 → en eski (old1) silinmeli
    const result = await evictForIncoming(400, SMALL_CAP);
    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(old1)).toBe(false); // en eski silindi
  });

  it('cap altındaysa evict YAPMAZ', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, 'small.bin'), Buffer.alloc(100));
    const result = await evictForIncoming(100, 1024); // 100+100=200 < 1024
    expect(result.removed).toBe(0);
  });

  it('pruneCache — TTL aşan dosyaları siler, taze olanı korur', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const oldFile = path.join(cacheRoot, 'old.bin');
    const freshFile = path.join(cacheRoot, 'fresh.bin');
    fs.writeFileSync(oldFile, Buffer.alloc(500));
    fs.writeFileSync(freshFile, Buffer.alloc(500));

    const now = Date.now();
    // old.bin = TTL+1 gün eski → silinmeli; fresh.bin = şimdi → kalmalı
    const ancient = now - (CACHE_TTL_MS + 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, new Date(ancient), new Date(ancient));
    fs.utimesSync(freshFile, new Date(now), new Date(now));

    const r = await pruneCache(CACHE_TTL_MS, now);
    expect(r.removedTtl).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
    expect(r.freedBytes).toBeGreaterThanOrEqual(500);
  });

  it('pruneCache — hepsi taze ise hiçbir şey silmez', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const now = Date.now();
    fs.writeFileSync(path.join(cacheRoot, 'a.bin'), Buffer.alloc(100));
    fs.writeFileSync(path.join(cacheRoot, 'b.bin'), Buffer.alloc(100));
    const r = await pruneCache(CACHE_TTL_MS, now);
    expect(r.removedTtl).toBe(0);
    expect(r.removedCap).toBe(0);
  });

  it('eşzamanlı writeCache çağrıları cap sınırını korur (eviction yarışı yok)', async () => {
    const CAP = 1000;
    // 5 × 400 bayt eşzamanlı yazım — serileştirme olmasa hepsi kalır (2000 > cap).
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        writeCache(path.join(cacheRoot, `f${i}.bin`), Buffer.alloc(400, i), undefined, CAP),
      ),
    );
    const total = fs
      .readdirSync(cacheRoot)
      .reduce((sum, name) => sum + fs.statSync(path.join(cacheRoot, name)).size, 0);
    expect(total).toBeLessThanOrEqual(CAP);
    // En az bir dosya (en son yazılan) hayatta kalmalı
    expect(fs.readdirSync(cacheRoot).length).toBeGreaterThan(0);
  });

  it('cap altındaki yazımlar dizini yeniden taramaz (bellek-içi toplam; tek init taraması)', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, 'pre.bin'), Buffer.alloc(10));
    const before = _getCacheScanCountForTest();
    for (let i = 0; i < 20; i++) {
      await writeCache(path.join(cacheRoot, `w${i}.bin`), Buffer.alloc(10), undefined, 10_000);
    }
    expect(_getCacheScanCountForTest() - before).toBe(1); // yalnız lazy init
  });

  it('writeCache yazımları serileşmez: uzun süren stream diğer yazımı bloklamaz', async () => {
    const slow = new Readable({
      read() {
        /* veri testte dışarıdan push edilir */
      },
    });
    const slowDone = writeCache(path.join(cacheRoot, 'slow.mp4'), slow, 5, 10_000);
    const fast = writeCache(path.join(cacheRoot, 'fast.jpg'), Buffer.from('ok'), undefined, 10_000);
    // Stream bitmeden hızlı yazım tamamlanır (eski global kuyrukta beklerdi → timeout)
    await fast;
    expect(fs.readFileSync(path.join(cacheRoot, 'fast.jpg'), 'utf8')).toBe('ok');
    expect(fs.existsSync(path.join(cacheRoot, 'slow.mp4'))).toBe(false);
    slow.push(Buffer.from('video'));
    slow.push(null);
    await slowDone;
    expect(fs.readFileSync(path.join(cacheRoot, 'slow.mp4'), 'utf8')).toBe('video');
  });

  it('cap dolunca eviction bellek-içi toplamla tetiklenir ve toplam cap altında kalır', async () => {
    const CAP = 1000;
    for (let i = 0; i < 10; i++) {
      await writeCache(path.join(cacheRoot, `s${i}.bin`), Buffer.alloc(300), undefined, CAP);
      const t = new Date(Date.now() - (100 - i) * 1000);
      fs.utimesSync(path.join(cacheRoot, `s${i}.bin`), t, t);
      const total = fs
        .readdirSync(cacheRoot)
        .reduce((sum, name) => sum + fs.statSync(path.join(cacheRoot, name)).size, 0);
      expect(total).toBeLessThanOrEqual(CAP);
    }
    expect(fs.existsSync(path.join(cacheRoot, 's9.bin'))).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, 's0.bin'))).toBe(false);
  });

  it('clearDirFiles yazımı süren geçici dosyayı silmez, final dosyaları siler', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const tmp = tempPathFor(path.join(cacheRoot, 'x.mp4'));
    fs.writeFileSync(tmp, 'transcode sürüyor');
    fs.writeFileSync(path.join(cacheRoot, 'done.jpg'), 'x');
    const r = await clearDirFiles(cacheRoot);
    expect(r.removedFiles).toBe(1);
    expect(fs.existsSync(tmp)).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, 'done.jpg'))).toBe(false);
  });

  // ─── Atomik yazım / geçici dosyalar ─────────────────────────────────────────
  it('tempPathFor uzantıyı sonda tutar, isTempCacheName tanır', () => {
    const t = tempPathFor(path.join(cacheRoot, 'abc.mp4'));
    expect(t.endsWith('.mp4')).toBe(true);
    expect(isTempCacheName(path.basename(t))).toBe(true);
    expect(isTempCacheName('abc.mp4')).toBe(false);
    expect(isTempCacheName('0123456789abcdef0123456789abcdef01234567.jpg')).toBe(false);
  });

  it('writeCache geçici dosya bırakmaz (buffer + stream)', async () => {
    await writeCache(path.join(cacheRoot, 'a.jpg'), Buffer.from('x'));
    await writeCache(path.join(cacheRoot, 'b.jpg'), Readable.from([Buffer.from('yz')]));
    expect(fs.readdirSync(cacheRoot).sort()).toEqual(['a.jpg', 'b.jpg']);
    expect(fs.readFileSync(path.join(cacheRoot, 'b.jpg'), 'utf8')).toBe('yz');
  });

  it('writeCache: kaynak stream hata verirse final dosya ve geçici dosya oluşmaz', async () => {
    const bad = new Readable({
      read() {
        this.push(Buffer.from('yarım'));
        this.destroy(new Error('kaynak koptu'));
      },
    });
    const target = path.join(cacheRoot, 'broken.mp4');
    await expect(writeCache(target, bad)).rejects.toThrow('kaynak koptu');
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readdirSync(cacheRoot)).toEqual([]);
    // Kuyruk hatadan sonra çalışmaya devam eder
    await writeCache(path.join(cacheRoot, 'ok.jpg'), Buffer.from('ok'));
    expect(fs.existsSync(path.join(cacheRoot, 'ok.jpg'))).toBe(true);
  });

  it('produceCacheFile: eşzamanlı çağrılar tek üretime bağlanır (in-flight dedupe)', async () => {
    const target = path.join(cacheRoot, 'v.mp4');
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const producer = async (tmp: string) => {
      calls++;
      await gate;
      fs.writeFileSync(tmp, 'video');
    };
    const a = produceCacheFile(target, producer);
    const b = produceCacheFile(target, producer);
    expect(isProducing(target)).toBe(true);
    // Üretim sürerken final path YOK (yarım dosya HIT sayılmasın)
    await new Promise((r) => setTimeout(r, 5));
    expect(fs.existsSync(target)).toBe(false);
    release();
    await Promise.all([a, b]);
    expect(calls).toBe(1);
    expect(isProducing(target)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('video');
    expect(fs.readdirSync(cacheRoot)).toEqual(['v.mp4']);
  });

  it('produceCacheFile: üretici hata verirse (ör. öldürülen ffmpeg) yarım dosya silinir, tekrar denenebilir', async () => {
    const target = path.join(cacheRoot, 'k.mp4');
    await expect(
      produceCacheFile(target, async (tmp) => {
        fs.writeFileSync(tmp, 'yarım çıktı');
        throw new Error('ffmpeg killed');
      }),
    ).rejects.toThrow('ffmpeg killed');
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readdirSync(cacheRoot)).toEqual([]);
    expect(
      (await lookupCache({ udid: 'U', manifestMtimeMs: 1, fileId: 'F', variant: 'x' }, '.mp4'))
        .exists,
    ).toBe(false);

    // In-flight kaydı temizlendi → yeni deneme yeni üretim başlatır
    await produceCacheFile(target, async (tmp) => fs.writeFileSync(tmp, 'tam'));
    expect(fs.readFileSync(target, 'utf8')).toBe('tam');
  });

  it('produceCacheFile sonrası 5GB cap uygulanır (eski dosya evict)', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const old = path.join(cacheRoot, 'old.bin');
    fs.writeFileSync(old, Buffer.alloc(600));
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(old, past, past);
    const target = path.join(cacheRoot, 'new.mp4');
    await produceCacheFile(target, async (tmp) => fs.writeFileSync(tmp, Buffer.alloc(600)), 1000);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('evictForIncoming yazımı süren geçici dosyaya dokunmaz', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const tmp = tempPathFor(path.join(cacheRoot, 'x.mp4'));
    fs.writeFileSync(tmp, Buffer.alloc(900));
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(tmp, past, past);
    fs.writeFileSync(path.join(cacheRoot, 'y.jpg'), Buffer.alloc(500));
    await evictForIncoming(500, 1000);
    expect(fs.existsSync(tmp)).toBe(true);
  });

  it('pruneCache yetim geçici dosyayı (TEMP_ORPHAN_MS) siler, tazesini korur', async () => {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const now = Date.now();
    const orphan = tempPathFor(path.join(cacheRoot, 'o.mp4'));
    const fresh = tempPathFor(path.join(cacheRoot, 'f.mp4'));
    fs.writeFileSync(orphan, 'x');
    fs.writeFileSync(fresh, 'x');
    const old = new Date(now - TEMP_ORPHAN_MS - 60_000);
    fs.utimesSync(orphan, old, old);
    const r = await pruneCache(CACHE_TTL_MS, now);
    expect(r.removedTtl).toBe(1);
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('cache root backup root DIŞINDA (cache yedeğe yazmıyor)', () => {
    const backupDir = path.join(getTmpRoot(), 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    setBackupRoot(backupDir);
    // cache root tmp/cache, backup root tmp/backup — farklı
    const cacheResolved = path.resolve(cacheRoot);
    const backupResolved = path.resolve(getBackupRoot()!);
    expect(cacheResolved.startsWith(backupResolved + path.sep)).toBe(false);
    expect(cacheResolved).not.toBe(backupResolved);
  });
});

describe('cache — özel (şifreli oturum) kök', () => {
  it('lookupCache privateRoot → yol oturum kökünde; writeCache/produceCacheFile muhasebesiz yazar', async () => {
    const managed = path.join(getTmpRoot(), 'cache');
    _setCacheRootForTest(managed);
    const priv = path.join(getTmpRoot(), 'afv-dec-x', 'cache');
    const input = { udid: 'U', manifestMtimeMs: 1, fileId: 'F', variant: 'thumb-160' };
    const c = await lookupCache(input, '.jpg', priv);
    expect(path.dirname(c.absPath)).toBe(priv);
    expect(c.exists).toBe(false);
    await writeCache(c.absPath, Buffer.from('jpeg'));
    expect((await lookupCache(input, '.jpg', priv)).exists).toBe(true);
    const t = path.join(priv, 'v.mp4');
    await produceCacheFile(t, async (tmp) => fs.writeFileSync(tmp, 'mp4'));
    expect(fs.readFileSync(t, 'utf8')).toBe('mp4');
    // Genel cache'e hiçbir şey düşmedi
    const managedFiles = fs.existsSync(managed) ? fs.readdirSync(managed) : [];
    expect(managedFiles).toEqual([]);
    expect((await lookupCache(input, '.jpg')).exists).toBe(false);
  });
});

// Suppress unused import warning — CACHE_HARD_CAP_BYTES is re-exported for callers
void CACHE_HARD_CAP_BYTES;
