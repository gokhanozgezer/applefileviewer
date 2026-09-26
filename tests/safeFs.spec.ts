import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as safeFs from '@main/safeFs';
import { getTmpRoot } from './setup';

describe('safeFs', () => {
  let backupRoot: string;
  let outsideRoot: string;

  beforeEach(() => {
    backupRoot = path.join(getTmpRoot(), 'backup');
    outsideRoot = path.join(getTmpRoot(), 'outside');
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.writeFileSync(path.join(backupRoot, 'sample.txt'), 'data');
    safeFs.setBackupRoot(backupRoot);
  });

  it('yazma fonksiyonları export edilmemiş', () => {
    const mod = safeFs as Record<string, unknown>;
    expect(mod['writeFile']).toBeUndefined();
    expect(mod['unlink']).toBeUndefined();
    expect(mod['rm']).toBeUndefined();
    expect(mod['rename']).toBeUndefined();
    expect(mod['mkdir']).toBeUndefined();
    expect(mod['rmdir']).toBeUndefined();
  });

  it('readFile yedek içinden çalışır', async () => {
    const data = await safeFs.readFile(path.join(backupRoot, 'sample.txt'));
    expect(data.toString()).toBe('data');
  });

  it('copyFileOut yedek dışına kopya kabul eder', async () => {
    const dest = path.join(outsideRoot, 'copy.txt');
    await safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('data');
  });

  // Group 3 — Error type contract (mevcut test instanceof'a yükseltildi)
  it('copyFileOut yedek köküne yazmayı reddeder', async () => {
    const dest = path.join(backupRoot, 'evil.txt');
    await expect(
      safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), dest),
    ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
  });

  it('BackupWriteForbiddenError code ve target property taşır', async () => {
    const dest = path.join(backupRoot, 'evil.txt');
    try {
      await safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), dest);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(safeFs.BackupWriteForbiddenError);
      expect((e as safeFs.BackupWriteForbiddenError).code).toBe('BACKUP_WRITE_FORBIDDEN');
      expect((e as safeFs.BackupWriteForbiddenError).target).toBe(path.resolve(dest));
      expect((e as safeFs.BackupWriteForbiddenError).name).toBe('BackupWriteForbiddenError');
    }
  });

  it('writeFileOut yedek dışına yazar, dizini oluşturur', async () => {
    const dest = path.join(outsideRoot, 'nested', 'out.json');
    await safeFs.writeFileOut(dest, '{"hello":"world"}');
    expect(fs.readFileSync(dest, 'utf8')).toBe('{"hello":"world"}');
  });

  it('writeFileOut korunan yedek kökü altına yazmayı reddeder (export klasörü yedek içi)', async () => {
    const dest = path.join(backupRoot, 'Notes', 'note.txt');
    await expect(safeFs.writeFileOut(dest, 'x')).rejects.toBeInstanceOf(
      safeFs.BackupWriteForbiddenError,
    );
    expect(fs.existsSync(path.join(backupRoot, 'Notes'))).toBe(false);
  });

  it('writeFileOut taranmış (açık olmayan) yedek kökünü de korur + null byte reddeder', async () => {
    const other = path.join(getTmpRoot(), 'otherBackups');
    safeFs.protectBackupRoots([other]);
    await expect(
      safeFs.writeFileOut(path.join(other, 'udid', 'x.csv'), 'x'),
    ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    await expect(safeFs.writeFileOut(path.join(outsideRoot, 'a\0.txt'), 'x')).rejects.toThrow();
  });

  it('getBackupRoot set olanı döndürür', () => {
    expect(safeFs.getBackupRoot()).toBe(backupRoot);
  });

  it('setBackupRoot null geçersiz path için throw eder', () => {
    expect(() => safeFs.setBackupRoot('')).toThrow();
  });

  it('createReadStream yedek içinden çalışır', async () => {
    const stream = safeFs.createReadStream(path.join(backupRoot, 'sample.txt'));
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('data');
  });

  // ─── Group 1 — Scope check edge cases ───────────────────────────────────

  describe('scope check edge cases', () => {
    beforeEach(() => {
      fs.mkdirSync(backupRoot, { recursive: true });
      fs.writeFileSync(path.join(backupRoot, 'sample.txt'), 'data');
      safeFs.setBackupRoot(backupRoot);
    });

    it('Inside-traversal — resolve sonucu kök altına düşen path reddedilir', async () => {
      const dest = path.join(backupRoot, 'sub', '..', 'evil.txt');
      await expect(
        safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), dest),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });

    it('URL-encoded `%2e%2e` literal segment kök altına yazma reddedilir', async () => {
      const dest = path.join(backupRoot, '%2e%2e', 'outside-fake.txt');
      await expect(
        safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), dest),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });

    it('Null byte içeren path reddedilir (defansif)', async () => {
      const dest = path.join(backupRoot, 'file\0.txt');
      await expect(safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), dest)).rejects.toThrow(); // BackupWriteForbiddenError veya generic — null byte kategorik reddedilmeli
    });
  });

  // ─── Group 2 — Windows case-insensitivity ────────────────────────────────

  describe.skipIf(process.platform !== 'win32')('Windows case-insensitive root protection', () => {
    beforeEach(() => {
      fs.mkdirSync(backupRoot, { recursive: true });
      fs.writeFileSync(path.join(backupRoot, 'sample.txt'), 'data');
    });

    it('lowercase root path attack — uppercase setBackupRoot, lowercase dest', async () => {
      safeFs.setBackupRoot(backupRoot.toUpperCase());
      await expect(
        safeFs.copyFileOut(
          path.join(backupRoot, 'sample.txt'),
          path.join(backupRoot.toLowerCase(), 'evil.txt'),
        ),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });

    it('all-uppercase dest reddedilir', async () => {
      safeFs.setBackupRoot(backupRoot);
      const upperDest = path.join(backupRoot.toUpperCase(), 'EVIL.TXT');
      await expect(
        safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), upperDest),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });

    it('mixed case sub-directory dest reddedilir', async () => {
      safeFs.setBackupRoot(backupRoot);
      const mixed = path.join(
        backupRoot.replace(/^./, (c) => c.toLowerCase()),
        'Sub',
        'file.txt',
      );
      await expect(
        safeFs.copyFileOut(path.join(backupRoot, 'sample.txt'), mixed),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });
  });

  // ─── Group 4 — setBackupRoot override semantics ──────────────────────────

  describe('setBackupRoot override', () => {
    it('ikinci çağrı yeni kökü set eder', () => {
      const a = path.join(getTmpRoot(), 'a');
      const b = path.join(getTmpRoot(), 'b');
      fs.mkdirSync(a, { recursive: true });
      fs.mkdirSync(b, { recursive: true });
      safeFs.setBackupRoot(a);
      expect(safeFs.getBackupRoot()).toBe(a);
      safeFs.setBackupRoot(b);
      expect(safeFs.getBackupRoot()).toBe(b);
    });

    it('override sonrası eski kök KORUNMAYA DEVAM EDER (birikimli koruma)', async () => {
      const a = path.join(getTmpRoot(), 'a');
      const b = path.join(getTmpRoot(), 'b');
      const outside = path.join(getTmpRoot(), 'outside');
      fs.mkdirSync(a, { recursive: true });
      fs.mkdirSync(b, { recursive: true });
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(a, 'src.txt'), 'data');
      safeFs.setBackupRoot(a);
      safeFs.setBackupRoot(b);
      // a daha önce açılmış bir yedek — başka yedek açılınca da yazmaya kapalı kalmalı
      await expect(
        safeFs.copyFileOut(path.join(a, 'src.txt'), path.join(a, 'copy.txt')),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
      // yedek dışı hedef serbest
      await expect(
        safeFs.copyFileOut(path.join(a, 'src.txt'), path.join(outside, 'copy.txt')),
      ).resolves.toBeUndefined();
    });

    it('override sonrası yeni kök koruma altında', async () => {
      const a = path.join(getTmpRoot(), 'a');
      const b = path.join(getTmpRoot(), 'b');
      fs.mkdirSync(a, { recursive: true });
      fs.mkdirSync(b, { recursive: true });
      fs.writeFileSync(path.join(a, 'src.txt'), 'data');
      safeFs.setBackupRoot(a);
      safeFs.setBackupRoot(b);
      await expect(
        safeFs.copyFileOut(path.join(a, 'src.txt'), path.join(b, 'evil.txt')),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });
  });

  // ─── Group 5 — setBackupRoot input validation ────────────────────────────

  describe('setBackupRoot input validation', () => {
    it('boş string reddedilir', () => {
      expect(() => safeFs.setBackupRoot('')).toThrow();
    });

    it('null reddedilir', () => {
      expect(() => safeFs.setBackupRoot(null as unknown as string)).toThrow();
    });

    it('undefined reddedilir', () => {
      expect(() => safeFs.setBackupRoot(undefined as unknown as string)).toThrow();
    });

    it('non-string tip reddedilir (runtime defansif)', () => {
      expect(() => safeFs.setBackupRoot(42 as unknown as string)).toThrow();
      expect(() => safeFs.setBackupRoot({} as unknown as string)).toThrow();
    });

    it('relative path `./foo` reddedilir', () => {
      expect(() => safeFs.setBackupRoot('./relative/path')).toThrow();
    });

    it('relative path (dotsuz) reddedilir', () => {
      expect(() => safeFs.setBackupRoot('relative-without-dot')).toThrow();
    });

    it('absolute POSIX path kabul edilir', () => {
      const valid = path.join(getTmpRoot(), 'valid');
      fs.mkdirSync(valid, { recursive: true });
      expect(() => safeFs.setBackupRoot(valid)).not.toThrow();
    });

    it.skipIf(process.platform !== 'win32')(
      'Windows: drive letter olmadan reddedilir (`Backup` non-absolute)',
      () => {
        expect(() => safeFs.setBackupRoot('Backup')).toThrow();
      },
    );

    it.skipIf(process.platform !== 'win32')(
      'Windows: `C:\\valid` kabul edilir (drive letter ile)',
      () => {
        expect(() => safeFs.setBackupRoot('C:\\valid-test-' + Date.now())).not.toThrow();
      },
    );
  });

  // ─── Group 6 — protectBackupRoots (tüm bilinen kökler) ───────────────────

  describe('protectBackupRoots', () => {
    beforeEach(() => {
      safeFs._resetProtectedRootsForTest();
    });

    it('taranan başka bir yedeğe (açık olmayan) yazma reddedilir', async () => {
      const parent = path.join(getTmpRoot(), 'MobileSync', 'Backup');
      const opened = path.join(parent, 'udid-open');
      const other = path.join(parent, 'udid-other');
      fs.mkdirSync(opened, { recursive: true });
      fs.mkdirSync(other, { recursive: true });
      fs.writeFileSync(path.join(opened, 'src.txt'), 'data');
      safeFs.setBackupRoot(opened);
      safeFs.protectBackupRoots([other]);
      await expect(
        safeFs.copyFileOut(path.join(opened, 'src.txt'), path.join(other, 'evil.txt')),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    });

    it('yedek üst köküne (default/override parent) yazma reddedilir', async () => {
      const parent = path.join(getTmpRoot(), 'Backup');
      const override = path.join(getTmpRoot(), 'Yedekler');
      fs.mkdirSync(parent, { recursive: true });
      fs.mkdirSync(override, { recursive: true });
      fs.writeFileSync(path.join(outsideRoot, 'src.txt'), 'data');
      safeFs.protectBackupRoots([parent, override]);
      const src = path.join(outsideRoot, 'src.txt');
      await expect(safeFs.copyFileOut(src, path.join(parent, 'x.txt'))).rejects.toBeInstanceOf(
        safeFs.BackupWriteForbiddenError,
      );
      await expect(
        safeFs.copyFileOut(src, path.join(override, 'yeni-klasor', 'x.txt')),
      ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
      // Kök kendisi de hedef olamaz
      await expect(safeFs.copyFileOut(src, override)).rejects.toBeInstanceOf(
        safeFs.BackupWriteForbiddenError,
      );
    });

    it('kardeş klasör (ortak önek) korunmaz — "Backup2" ≠ "Backup"', async () => {
      const parent = path.join(getTmpRoot(), 'Backup');
      const sibling = path.join(getTmpRoot(), 'Backup2');
      fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(path.join(outsideRoot, 'src.txt'), 'data');
      safeFs.protectBackupRoots([parent]);
      await expect(
        safeFs.copyFileOut(path.join(outsideRoot, 'src.txt'), path.join(sibling, 'ok.txt')),
      ).resolves.toBeUndefined();
    });

    it('geçersiz girdiler (null, göreli, boş, null byte) sessizce atlanır', () => {
      safeFs.protectBackupRoots([
        null,
        undefined,
        '',
        'relative/path',
        path.join(getTmpRoot(), 'x' + String.fromCharCode(0) + 'y'),
      ]);
      expect(safeFs.getProtectedRoots()).toEqual([]);
    });

    it('korunan kökler birikir, tekrar ekleme çoğaltmaz', () => {
      const a = path.join(getTmpRoot(), 'a');
      safeFs.protectBackupRoots([a, a]);
      safeFs.setBackupRoot(a);
      expect(safeFs.getProtectedRoots()).toHaveLength(1);
    });

    it.skipIf(process.platform !== 'win32')(
      'win32: büyük/küçük harf farkı korumayı aşamaz',
      async () => {
        const parent = path.join(getTmpRoot(), 'Backup');
        fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(path.join(outsideRoot, 'src.txt'), 'data');
        safeFs.protectBackupRoots([parent.toLowerCase()]);
        await expect(
          safeFs.copyFileOut(
            path.join(outsideRoot, 'src.txt'),
            path.join(parent.toUpperCase(), 'e.txt'),
          ),
        ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
      },
    );
  });
});

describe('safeFs — şifre çözüm oturum dizinleri', () => {
  it('makeDecryptSessionDir tmpdir altında afv-dec-<tag>- dizini oluşturur; remove siler', async () => {
    const dir = await safeFs.makeDecryptSessionDir('123');
    try {
      expect(path.dirname(dir)).toBe(path.resolve(os.tmpdir()));
      expect(path.basename(dir)).toMatch(/^afv-dec-123-/);
      expect(safeFs.isDecryptSessionDir(dir)).toBe(true);
      await safeFs.mkdirInDecryptSessionDir(dir, path.join(dir, 'cache', 'x'));
      fs.writeFileSync(path.join(dir, 'cache', 'x', 'f'), 'düz');
    } finally {
      await safeFs.removeDecryptSessionDir(dir);
    }
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('geçersiz tag reddedilir', async () => {
    await expect(safeFs.makeDecryptSessionDir('../x')).rejects.toThrow();
  });

  it('oturum dizini olmayan yollar silinemez (keyfi rm yüzeyi yok)', async () => {
    const other = path.join(getTmpRoot(), 'afv-dec-1-x');
    fs.mkdirSync(other, { recursive: true });
    await expect(safeFs.removeDecryptSessionDir(other)).rejects.toThrow(
      safeFs.BackupWriteForbiddenError,
    );
    expect(() => safeFs.removeDecryptSessionDirSync(os.tmpdir())).toThrow(
      safeFs.BackupWriteForbiddenError,
    );
    expect(fs.existsSync(other)).toBe(true);
    expect(safeFs.isDecryptSessionDir(path.join(os.tmpdir(), 'afv-test-x'))).toBe(false);
  });

  it('mkdirInDecryptSessionDir oturum dizini dışına çıkamaz', async () => {
    const dir = await safeFs.makeDecryptSessionDir('7');
    try {
      await expect(
        safeFs.mkdirInDecryptSessionDir(dir, path.join(dir, '..', 'kaçış')),
      ).rejects.toThrow(safeFs.BackupWriteForbiddenError);
    } finally {
      await safeFs.removeDecryptSessionDir(dir);
    }
  });
});
