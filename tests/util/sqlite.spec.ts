import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {
  openReadOnlyTmp,
  computeCacheKey,
  _resetTmpCacheForTest,
  TMP_CACHE_DIR,
} from '@main/util/sqlite';
import { getTmpRoot } from '../setup';

function countCacheFiles(): number {
  try {
    return fs.readdirSync(TMP_CACHE_DIR).length;
  } catch {
    return 0;
  }
}

describe('util/sqlite', () => {
  let backupRoot: string;
  let sourceDbPath: string;

  beforeEach(() => {
    _resetTmpCacheForTest();
    // Test izolasyonu için TMP_CACHE_DIR'ı temizle
    if (fs.existsSync(TMP_CACHE_DIR)) {
      fs.rmSync(TMP_CACHE_DIR, { recursive: true, force: true });
    }
    backupRoot = path.join(getTmpRoot(), 'backup');
    fs.mkdirSync(backupRoot, { recursive: true });
    sourceDbPath = path.join(backupRoot, 'sample.db');

    // Sentetik SQLite DB oluştur (better-sqlite3 ile direkt yazma; bu test setup'ı,
    // ürün kodu değil — invariant kapsamı dışı)
    const db = new Database(sourceDbPath);
    db.exec(`
      CREATE TABLE t (k TEXT PRIMARY KEY, v TEXT);
      INSERT INTO t VALUES ('a', '1');
    `);
    db.close();
  });

  // ─── Assertion 1: readonly invariant — INSERT denemesi gerçekten reddedilmeli
  it('açtığı DB readonly — INSERT denemesi SQLITE_READONLY ile reddedilir', async () => {
    const db = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    expect(() => db.exec("INSERT INTO t VALUES ('b', '2')")).toThrow(/readonly/i);
    db.close();
  });

  // ─── Assertion 2: fileMustExist invariant — var olmayan path için throw
  it('var olmayan source path için throw (fileMustExist semantiği)', async () => {
    const ghostPath = path.join(backupRoot, 'ghost.db');
    await expect(openReadOnlyTmp({ udid: 'test-udid', absPath: ghostPath })).rejects.toThrow(
      /ENOENT|not found|cantopen/i,
    );
  });

  // ─── Assertion 3: Cache HIT — aynı mtime ile ikinci çağrı yeni tmp dosya YARATMAZ
  it('cache HIT: aynı mtime ile ikinci çağrı tmp dosya sayısını arttırmaz (counter)', async () => {
    const before = countCacheFiles();

    const db1 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    const tmpPath1 = (db1 as unknown as { name: string }).name;
    db1.close();
    const afterFirst = countCacheFiles();
    expect(afterFirst).toBe(before + 1);

    const db2 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    expect((db2 as unknown as { name: string }).name).toBe(tmpPath1);
    db2.close();
    const afterSecond = countCacheFiles();

    // KRİTİK: counter ARTMAMALI (cache hit, yeni dosya yok)
    expect(afterSecond).toBe(afterFirst);
  });

  // ─── Assertion 4: Cache MISS — source mtime değişince yeni tmp dosya üretilir
  // Tasarım A (immutable cache): her unique key ayrı dosya. Cache miss = yeni sha1 = yeni dosya path.
  // Bu test Tasarım A'yı pinler. 1.5b implementer Tasarım B (sabit path + manifest) seçerse FAIL eder
  // ve gerekçesini açıklamak zorunda kalır.
  it('cache MISS: source mtime değişince yeni tmp dosya (Design A: ayrı path, counter +1)', async () => {
    const db1 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    const tmpPath1 = (db1 as unknown as { name: string }).name;
    db1.close();
    const afterFirst = countCacheFiles();

    // Source mtime'ı ileri al
    const futureMs = Date.now() + 5_000;
    fs.utimesSync(sourceDbPath, new Date(futureMs), new Date(futureMs));

    const db2 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    expect((db2 as unknown as { name: string }).name).not.toBe(tmpPath1);
    db2.close();
    const afterSecond = countCacheFiles();

    // KRİTİK: yeni dosya oluştu (Design A immutable cache)
    expect(afterSecond).toBe(afterFirst + 1);
  });

  // ─── Assertion 5: Cache key formatı — DETERMİNİSTİK sözleşme
  // Birleşim sırası: udid → dbAbsPath → dbMtimeMs
  // Separator: '|' (çakışma önleme — sha1('a|bc') ≠ sha1('ab|c'))
  // Bu sırayı veya separator'u DEĞİŞTİRMEK breaking change: tüm mevcut cache invalidate olur.
  // Implementasyon 1.5b'de bu sırayı ve separator'u DEĞİŞTİREMEZ; sadece use eder.
  it('computeCacheKey deterministik sha1 hex — golden value (sıra + separator pinli)', () => {
    const udid = 'test-udid';
    const dbAbsPath = '/tmp/backup/Manifest.db';
    const dbMtimeMs = 1_234_567_890_000;
    // Golden input string formatı — implementation BU formatı kullanmak zorunda
    const expectedInput = `${udid}|${dbAbsPath}|${dbMtimeMs}`;
    const expected = crypto.createHash('sha1').update(expectedInput).digest('hex');
    expect(computeCacheKey(udid, dbAbsPath, dbMtimeMs)).toBe(expected);
    expect(expected).toMatch(/^[a-f0-9]{40}$/);
  });

  // ─── Assertion 6: Original dokunulmazlık — sidecar 3 aşamada da yok
  // WAL sidecar bazen connection açıkken oluşur, close'da silinir.
  // En sağlam: AÇILIŞ + GERÇEK SELECT (I/O tetikle) + CLOSE üç aşamasında da source dizini temiz olmalı.
  it('source dizininde -wal/-shm/-journal sidecar yok (open + SELECT + close 3 aşamada)', async () => {
    const beforeFiles = new Set(fs.readdirSync(backupRoot));
    const diff = (now: Set<string>) => [...now].filter((f) => !beforeFiles.has(f));

    // Stage 1: AÇILIŞ sonrası
    const db = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    const afterOpen = new Set(fs.readdirSync(backupRoot));
    expect(diff(afterOpen)).toEqual([]);

    // Stage 2: GERÇEK SELECT (I/O tetikle, WAL açılma şansı en yüksek)
    db.prepare('SELECT v FROM t WHERE k = ?').get('a');
    const afterSelect = new Set(fs.readdirSync(backupRoot));
    expect(diff(afterSelect)).toEqual([]);

    // Stage 3: CLOSE sonrası
    db.close();
    const afterClose = new Set(fs.readdirSync(backupRoot));
    expect(diff(afterClose)).toEqual([]);

    // Explicit sidecar dosya isimleri (çift güvence — 3 stage'in herhangi birinde sıkıştırıldıysa final check yakalar)
    expect(fs.existsSync(sourceDbPath + '-wal')).toBe(false);
    expect(fs.existsSync(sourceDbPath + '-shm')).toBe(false);
    expect(fs.existsSync(sourceDbPath + '-journal')).toBe(false);
  });

  // ─── Assertion 7: Tmp konumu — kopya os.tmpdir() altında, backup root altında DEĞİL
  it('tmp kopya os.tmpdir() altında, backup root altında değil', async () => {
    const db = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    const tmpPath = (db as unknown as { name: string }).name;
    db.close();

    const tmpResolved = path.resolve(tmpPath);
    const osTmpResolved = path.resolve(os.tmpdir());
    const backupResolved = path.resolve(backupRoot);

    expect(tmpResolved.startsWith(osTmpResolved)).toBe(true);
    expect(tmpResolved.startsWith(backupResolved + path.sep)).toBe(false);
    expect(tmpResolved).not.toBe(backupResolved);
  });
  // ─── Eşzamanlı MISS: aynı key için tek kopya, ikisi de sağlam DB açar
  it('eşzamanlı openReadOnlyTmp (aynı key) tek snapshot üretir, hepsi okunabilir', async () => {
    const dbs = await Promise.all(
      Array.from({ length: 6 }, () =>
        openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath }),
      ),
    );
    try {
      const names = new Set(dbs.map((d) => (d as unknown as { name: string }).name));
      expect(names.size).toBe(1);
      for (const d of dbs) {
        expect(d.prepare('SELECT v FROM t WHERE k = ?').get('a')).toEqual({ v: '1' });
        expect(d.pragma('integrity_check', { simple: true })).toBe('ok');
      }
    } finally {
      for (const d of dbs) d.close();
    }
    // Final snapshot dışında (.part) artık dosya kalmamalı
    expect(fs.readdirSync(TMP_CACHE_DIR)).toHaveLength(1);
    expect(fs.readdirSync(TMP_CACHE_DIR).some((n) => n.endsWith('.part'))).toBe(false);
  });

  // ─── Kopya hatası: yarım .part dosyası silinir, final path oluşmaz
  it('kopya hata verirse yarım dosya kalmaz (sonraki çağrı HIT sanmaz)', async () => {
    // Dizin: stat başarılı, createReadStream okuma EISDIR ile düşer
    const dirSource = path.join(backupRoot, 'notafile.db');
    fs.mkdirSync(dirSource);
    await expect(openReadOnlyTmp({ udid: 'test-udid', absPath: dirSource })).rejects.toThrow();
    const left = fs.existsSync(TMP_CACHE_DIR) ? fs.readdirSync(TMP_CACHE_DIR) : [];
    expect(left).toEqual([]);
  });

  // ─── Restart: cacheMap boş ama diskte aynı boyutlu snapshot → yeniden kopyalanmaz
  it('restart sonrası (map boş) aynı boyutlu mevcut snapshot yeniden kullanılır', async () => {
    const db1 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    const snap = (db1 as unknown as { name: string }).name;
    db1.close();
    const mtimeBefore = fs.statSync(snap).mtimeMs;

    // Map'i unut ama disk kalsın (restart simülasyonu): dosyayı sakla, reset, geri koy
    const saved = fs.readFileSync(snap);
    _resetTmpCacheForTest();
    fs.mkdirSync(TMP_CACHE_DIR, { recursive: true });
    fs.writeFileSync(snap, saved);
    const past = new Date(mtimeBefore - 60_000);
    fs.utimesSync(snap, past, past);
    const inoBefore = fs.statSync(snap).ino;

    const db2 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    expect((db2 as unknown as { name: string }).name).toBe(snap);
    db2.close();
    // Üzerine yazılmadı (yeni kopya rename edilseydi dosya kimliği değişirdi)
    expect(fs.statSync(snap).ino).toBe(inoBefore);
    // Yeniden kullanımda touch edildi → TTL prune'u kullanılan snapshot'ı eski saymaz
    expect(fs.statSync(snap).mtimeMs).toBeGreaterThan(past.getTime() + 30_000);
  });

  // ─── Restart: boyutu tutmayan (eski sürümün yarım kopyası) snapshot yeniden kopyalanır
  it('restart sonrası boyutu farklı (yarım) snapshot yeniden kopyalanır', async () => {
    const db1 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    const snap = (db1 as unknown as { name: string }).name;
    db1.close();

    _resetTmpCacheForTest();
    fs.mkdirSync(TMP_CACHE_DIR, { recursive: true });
    fs.writeFileSync(snap, Buffer.alloc(100)); // bozuk/yarım içerik

    const db2 = await openReadOnlyTmp({ udid: 'test-udid', absPath: sourceDbPath });
    expect(db2.prepare('SELECT v FROM t WHERE k = ?').get('a')).toEqual({ v: '1' });
    db2.close();
    expect(fs.statSync(snap).size).toBe(fs.statSync(sourceDbPath).size);
  });
});
