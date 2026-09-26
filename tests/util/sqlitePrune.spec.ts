import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  pruneTmpSqliteCache,
  openReadOnlyTmp,
  computeCacheKey,
  TMP_CACHE_DIR,
  _resetTmpCacheForTest,
} from '@main/util/sqlite';
import { getTmpRoot } from '../setup';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSnapshot(name: string, sizeBytes: number, ageMs: number, now: number): string {
  fs.mkdirSync(TMP_CACHE_DIR, { recursive: true });
  const abs = path.join(TMP_CACHE_DIR, name);
  fs.writeFileSync(abs, Buffer.alloc(sizeBytes, 1));
  const mtime = new Date(now - ageMs);
  fs.utimesSync(abs, mtime, mtime);
  return abs;
}

describe('pruneTmpSqliteCache', () => {
  const NOW = Date.now();

  beforeEach(() => {
    _resetTmpCacheForTest();
  });

  it('dizin yoksa sessizce boş sonuç döner', async () => {
    const r = await pruneTmpSqliteCache({ now: NOW });
    expect(r).toEqual({ removed: 0, kept: 0, freedBytes: 0 });
  });

  it('TTL süresi dolan snapshot silinir, tazeler kalır', async () => {
    const old = makeSnapshot('old.db', 100, 8 * DAY_MS, NOW);
    const fresh = makeSnapshot('fresh.db', 100, 1 * DAY_MS, NOW);

    const r = await pruneTmpSqliteCache({ ttlMs: 7 * DAY_MS, now: NOW });

    expect(r.removed).toBe(1);
    expect(r.kept).toBe(1);
    expect(r.freedBytes).toBe(100);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('boyut sınırı aşılınca en eskiler silinir', async () => {
    const oldest = makeSnapshot('a.db', 400, 3 * DAY_MS, NOW);
    const middle = makeSnapshot('b.db', 400, 2 * DAY_MS, NOW);
    const newest = makeSnapshot('c.db', 400, 1 * DAY_MS, NOW);

    // TTL geniş — yalnızca boyut sınırı tetiklenir (1000 bayt < 1200 toplam)
    const r = await pruneTmpSqliteCache({ ttlMs: 30 * DAY_MS, maxBytes: 1000, now: NOW });

    expect(fs.existsSync(oldest)).toBe(false);
    expect(fs.existsSync(middle)).toBe(true);
    expect(fs.existsSync(newest)).toBe(true);
    expect(r.removed).toBe(1);
  });

  it('sınır altındaysa hiçbir şey silinmez', async () => {
    const a = makeSnapshot('a.db', 100, 1 * DAY_MS, NOW);
    const b = makeSnapshot('b.db', 100, 2 * DAY_MS, NOW);

    const r = await pruneTmpSqliteCache({ ttlMs: 7 * DAY_MS, maxBytes: 1000, now: NOW });

    expect(r.removed).toBe(0);
    expect(fs.existsSync(a)).toBe(true);
    expect(fs.existsSync(b)).toBe(true);
  });

  it('TTL + boyut birlikte: önce TTL, sonra kalanlar için boyut', async () => {
    makeSnapshot('expired.db', 500, 10 * DAY_MS, NOW);
    const oldSurvivor = makeSnapshot('olds.db', 500, 2 * DAY_MS, NOW);
    const newSurvivor = makeSnapshot('news.db', 500, 1 * DAY_MS, NOW);

    const r = await pruneTmpSqliteCache({ ttlMs: 7 * DAY_MS, maxBytes: 600, now: NOW });

    // expired TTL ile, oldSurvivor boyut sınırıyla gitti
    expect(r.removed).toBe(2);
    expect(fs.existsSync(oldSurvivor)).toBe(false);
    expect(fs.existsSync(newSurvivor)).toBe(true);
  });

  it('boyut süpürmesi süren kopyanın .part dosyasına dokunmaz; yetim .part TTL ile gider', async () => {
    const part = makeSnapshot('k.db.abcdef123456.part', 800, 3 * DAY_MS, NOW);
    const orphan = makeSnapshot('o.db.abcdef654321.part', 100, 10 * DAY_MS, NOW);
    const snap = makeSnapshot('s.db', 400, 1 * DAY_MS, NOW);

    await pruneTmpSqliteCache({ ttlMs: 7 * DAY_MS, maxBytes: 500, now: NOW });

    expect(fs.existsSync(part)).toBe(true); // en eski olsa da in-flight kabul edilir
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(snap)).toBe(false); // sınır için silinen gerçek snapshot
  });

  describe('kullanımdaki snapshot korunur', () => {
    let src: string;

    beforeEach(() => {
      src = path.join(getTmpRoot(), 'src.db');
      const db = new Database(src);
      db.exec("CREATE TABLE t (k TEXT); INSERT INTO t VALUES ('a');");
      db.close();
    });

    function snapshotPathFor(udid: string): string {
      const key = computeCacheKey(udid, src, fs.statSync(src).mtimeMs);
      return path.join(TMP_CACHE_DIR, `${key}.db`);
    }

    it('boyutla yeniden kullanılan eski (>TTL) snapshot touch edilir, prune silmez', async () => {
      // Önceki oturumdan kalan, TTL'i geçmiş ama içeriği doğru snapshot
      const snap = snapshotPathFor('u1');
      fs.mkdirSync(TMP_CACHE_DIR, { recursive: true });
      fs.copyFileSync(src, snap);
      const old = new Date(Date.now() - 10 * DAY_MS);
      fs.utimesSync(snap, old, old);

      const db = await openReadOnlyTmp({ udid: 'u1', absPath: src });
      expect(Date.now() - fs.statSync(snap).mtimeMs).toBeLessThan(DAY_MS); // touch edildi
      db.close();

      const r = await pruneTmpSqliteCache({ ttlMs: 7 * DAY_MS });
      expect(r.removed).toBe(0);
      expect(fs.existsSync(snap)).toBe(true);
    });

    it("cacheMap'teki snapshot TTL/boyut süpürmesinde silinmez, yeniden açılabilir", async () => {
      const db1 = await openReadOnlyTmp({ udid: 'u2', absPath: src });
      db1.close();
      const snap = snapshotPathFor('u2');
      const old = new Date(Date.now() - 10 * DAY_MS);
      fs.utimesSync(snap, old, old);

      const r = await pruneTmpSqliteCache({ ttlMs: 7 * DAY_MS, maxBytes: 1 });
      expect(r.removed).toBe(0);
      expect(fs.existsSync(snap)).toBe(true);
      const db2 = await openReadOnlyTmp({ udid: 'u2', absPath: src });
      expect(db2.prepare('SELECT k FROM t').get()).toEqual({ k: 'a' });
      db2.close();
    });
  });
});
