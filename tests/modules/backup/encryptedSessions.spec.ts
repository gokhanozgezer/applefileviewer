// Şifreli yedek oturumu + tek dosya çözücü (resolveBackupFile): kilit açma sonuçları,
// düz/şifreli yol çözümü, eksik kayıt, in-flight dedupe, iptal, kilitte silme + türetilmiş
// önbellek temizliği, açılışta yetim dizin temizliği.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type * as CryptoModule from '@main/modules/crypto';
import type { EncryptedBackupSession } from '@main/modules/crypto';

// decryptFileTo çağrılarını sayabilmek + kapıda bekletebilmek için gerçek oturumu sarmala.
const decryptCalls: string[] = [];
let gate: Promise<void> | null = null;
vi.mock('@main/modules/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof CryptoModule>();
  return {
    ...orig,
    openEncryptedBackup: async (dir: string, pw: string): Promise<EncryptedBackupSession> => {
      const s = await orig.openEncryptedBackup(dir, pw);
      const decryptFileTo = s.decryptFileTo.bind(s);
      return Object.assign(s, {
        decryptFileTo: async (
          inAbs: string,
          outAbs: string,
          rec: Parameters<EncryptedBackupSession['decryptFileTo']>[2],
          signal?: AbortSignal,
        ) => {
          decryptCalls.push(path.basename(outAbs));
          if (gate) await gate;
          return decryptFileTo(inAbs, outAbs, rec, signal);
        },
      });
    },
  };
});

import {
  unlockEncryptedBackup,
  lockEncryptedBackup,
  isBackupUnlocked,
  sessionDirOf,
  sessionCacheDir,
  cleanupLeftoverSessionDirs,
  _inFlightDecryptsForTest,
  _resetEncryptedSessionsForTest,
} from '@main/modules/backup/encryptedSessions';
import { resolveBackupFile, openBackupDb } from '@main/modules/backup/resolveBackupFile';
import { registerBackup, _resetBackupRegistry } from '@main/modules/backup/backupRegistry';
import { fileIdToBackupPath, computeFileId } from '@main/modules/manifest/fileId';
import {
  getCorpus,
  _corpusCacheStatsForTest,
  _resetCorpusCacheForTest,
} from '@main/modules/search/corpusCache';
import { TMP_CACHE_DIR, _resetTmpCacheForTest } from '@main/util/sqlite';
import { listConversations } from '@main/modules/messages/listConversations';
import { listContacts } from '@main/modules/contacts/listContacts';
import { getTmpRoot } from '../../setup';
import {
  writeEncryptedSessionFixture,
  ENC_PASSWORD,
  MEDIA_BYTES,
  MEDIA_FILE_ID,
  type EncryptedFixture,
} from './encryptedSessionFixture';

const SMS_ID = computeFileId('HomeDomain', 'Library/SMS/sms.db');

let fx: EncryptedFixture;

function unlock(password = ENC_PASSWORD) {
  return unlockEncryptedBackup({ udid: fx.udid, rootPath: fx.rootPath, password });
}

beforeEach(() => {
  decryptCalls.length = 0;
  gate = null;
  _resetBackupRegistry();
  _resetCorpusCacheForTest();
  _resetTmpCacheForTest();
  fx = writeEncryptedSessionFixture(getTmpRoot());
  registerBackup({ udid: fx.udid, rootPath: fx.rootPath, isEncrypted: true });
});

afterEach(() => {
  _resetEncryptedSessionsForTest();
});

describe('unlockEncryptedBackup', () => {
  it('doğru parola → ok; oturum dizini tmpdir/afv-dec-<pid>-* altında, çözülmüş Manifest.db içerir', async () => {
    expect(await unlock()).toEqual({ status: 'ok' });
    expect(isBackupUnlocked(fx.udid, fx.rootPath)).toBe(true);
    const dir = sessionDirOf(fx.udid)!;
    expect(path.dirname(dir)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(dir)).toMatch(new RegExp(`^afv-dec-${process.pid}-`));
    const head = fs.readFileSync(path.join(dir, 'Manifest.db')).subarray(0, 15).toString('latin1');
    expect(head).toBe('SQLite format 3');
  });

  it('yanlış parola → wrongPassword; oturum/dizin kalmaz', async () => {
    const before = fs
      .readdirSync(os.tmpdir())
      .filter((n) => n.startsWith(`afv-dec-${process.pid}-`));
    expect(await unlock('yanlış')).toEqual({ status: 'wrongPassword' });
    expect(isBackupUnlocked(fx.udid, fx.rootPath)).toBe(false);
    const after = fs
      .readdirSync(os.tmpdir())
      .filter((n) => n.startsWith(`afv-dec-${process.pid}-`));
    expect(after).toEqual(before);
  });

  it('bozuk yedek (Manifest.plist yok) → error, parola mesajda geçmez', async () => {
    fs.rmSync(path.join(fx.backupDir, 'Manifest.plist'));
    const res = await unlock('gizli-parola-123');
    expect(res.status).toBe('error');
    expect(JSON.stringify(res)).not.toContain('gizli-parola-123');
    expect(isBackupUnlocked(fx.udid, fx.rootPath)).toBe(false);
  });

  it('zaten açıksa yeniden türetmeden ok', async () => {
    await unlock();
    const dir = sessionDirOf(fx.udid);
    expect(await unlock()).toEqual({ status: 'ok' });
    expect(sessionDirOf(fx.udid)).toBe(dir);
  });
});

describe('resolveBackupFile', () => {
  it('şifresiz (kayıtsız / şifresiz) yedek → eski yol, fs erişimi yok', async () => {
    const udid = 'a'.repeat(40);
    const root = path.join(getTmpRoot(), 'plain-root', udid);
    expect(await resolveBackupFile(udid, root, SMS_ID)).toBe(fileIdToBackupPath(root, SMS_ID));
    registerBackup({ udid, rootPath: path.dirname(root), isEncrypted: false });
    expect(await resolveBackupFile(udid, root, SMS_ID)).toBe(fileIdToBackupPath(root, SMS_ID));
  });

  it('kilitli şifreli yedek → null (şifreli blob yolu asla dönmez)', async () => {
    expect(await resolveBackupFile(fx.udid, fx.backupDir, SMS_ID)).toBeNull();
  });

  it('geçersiz fileId → null', async () => {
    await unlock();
    expect(await resolveBackupFile(fx.udid, fx.backupDir, '../../etc/passwd')).toBeNull();
  });

  it('kilidi açık → oturum dizinine tembel çözüm (<oturum>/<xx>/<fileId>), içerik düz metinle aynı', async () => {
    await unlock();
    const dir = sessionDirOf(fx.udid)!;
    const p = await resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID);
    expect(p).toBe(path.join(dir, MEDIA_FILE_ID.slice(0, 2), MEDIA_FILE_ID));
    expect(fs.readFileSync(p!).equals(MEDIA_BYTES)).toBe(true);
    // İkinci çağrı diskten (yeniden çözüm yok)
    expect(await resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID)).toBe(p);
    expect(decryptCalls).toEqual([MEDIA_FILE_ID]);
  });

  it('Manifest.db kaydı yok → null; kayıt var ama blob yok → null', async () => {
    await unlock();
    expect(await resolveBackupFile(fx.udid, fx.backupDir, 'f'.repeat(40))).toBeNull();
    fs.rmSync(fileIdToBackupPath(fx.backupDir, MEDIA_FILE_ID));
    expect(await resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID)).toBeNull();
  });

  it('başka kökteki aynı udid için çözüm yok', async () => {
    await unlock();
    const other = path.join(getTmpRoot(), 'other', fx.udid);
    expect(await resolveBackupFile(fx.udid, other, MEDIA_FILE_ID)).toBeNull();
  });

  it('eşzamanlı istekler tek çözüme bağlanır (in-flight dedupe)', async () => {
    await unlock();
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const a = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID);
    const b = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID);
    const c = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID, new AbortController().signal);
    await Promise.resolve();
    expect(_inFlightDecryptsForTest(fx.udid)).toBe(1);
    open();
    const [pa, pb, pc] = await Promise.all([a, b, c]);
    expect(pa).toBe(pb);
    expect(pb).toBe(pc);
    expect(decryptCalls).toHaveLength(1);
    expect(_inFlightDecryptsForTest(fx.udid)).toBe(0);
  });

  it('tek bekleyen iptal ederse çözüm iptal edilir, yarım çıktı kalmaz', async () => {
    await unlock();
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const ac = new AbortController();
    const p = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID, ac.signal);
    await Promise.resolve();
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    open();
    await vi.waitFor(() => expect(_inFlightDecryptsForTest(fx.udid)).toBe(0));
    const sub = path.join(sessionDirOf(fx.udid)!, MEDIA_FILE_ID.slice(0, 2));
    const left = fs.existsSync(sub) ? fs.readdirSync(sub) : [];
    expect(left).toEqual([]);
    // Sonraki istek baştan çözer
    const again = await resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID);
    expect(fs.readFileSync(again!).equals(MEDIA_BYTES)).toBe(true);
  });

  it('bir bekleyen iptal etse de diğeri sonucu alır', async () => {
    await unlock();
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const p1 = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID, ac1.signal);
    const p2 = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID, ac2.signal);
    await Promise.resolve();
    ac1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    open();
    const r2 = await p2;
    expect(fs.readFileSync(r2!).equals(MEDIA_BYTES)).toBe(true);
  });

  it('openBackupDb: çözülmüş SQLite yerinde açılır — TMP_CACHE_DIR’e düz metin kopya yazılmaz', async () => {
    await unlock();
    const db = await openBackupDb(fx.udid, fx.backupDir, 'HomeDomain', 'Library/SMS/sms.db');
    expect(db).not.toBeNull();
    try {
      expect(db!.name.startsWith(sessionDirOf(fx.udid)!)).toBe(true);
      expect(
        (db!.prepare('SELECT COUNT(*) AS n FROM message').get() as { n: number }).n,
      ).toBeGreaterThan(0);
    } finally {
      db!.close();
    }
    const snaps = fs.existsSync(TMP_CACHE_DIR) ? fs.readdirSync(TMP_CACHE_DIR) : [];
    expect(snaps).toEqual([]);
  });

  it('modül okuyucuları (mesajlar, kişiler) kilidi açık şifreli yedekten veri döndürür', async () => {
    await unlock();
    const convs = await listConversations({ udid: fx.udid, rootPath: fx.rootPath });
    expect(convs.some((c) => c.identifier === '+905551234567')).toBe(true);
    const contacts = await listContacts({ udid: fx.udid, rootPath: fx.rootPath });
    expect(contacts.length).toBeGreaterThan(0);
  });
});

describe('lockEncryptedBackup', () => {
  it('oturum dizinini siler, türetilmiş korpus + cache temizlenir, çözücü yeniden null döner', async () => {
    await unlock();
    const dir = sessionDirOf(fx.udid)!;
    await resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID);
    const cacheDir = (await sessionCacheDir(fx.udid))!;
    expect(cacheDir.startsWith(dir)).toBe(true);
    fs.writeFileSync(path.join(cacheDir, 'thumb.jpg'), 'x');
    // Arama korpusu anahtarı çözülmüş DB yolunu taşır (globalSearch: `<domain>|<db.name>`)
    getCorpus(`messages|${path.join(dir, 'aa', 'x')}`, () => [{ f: 'merhaba', m: 1 }]);
    getCorpus('messages|C:/baska/snapshot.db', () => [{ f: 'dokunma', m: 2 }]);
    expect(_corpusCacheStatsForTest().entries).toBe(2);

    expect(await lockEncryptedBackup(fx.udid)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
    expect(isBackupUnlocked(fx.udid, fx.rootPath)).toBe(false);
    expect(await sessionCacheDir(fx.udid)).toBeNull();
    expect(_corpusCacheStatsForTest().entries).toBe(1);
    expect(await resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID)).toBeNull();
    expect(await lockEncryptedBackup(fx.udid)).toBe(false);
  });

  it('süren çözüm kilitte iptal edilir ve dizin yine silinir', async () => {
    await unlock();
    const dir = sessionDirOf(fx.udid)!;
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const p = resolveBackupFile(fx.udid, fx.backupDir, MEDIA_FILE_ID);
    await Promise.resolve();
    const locking = lockEncryptedBackup(fx.udid);
    open();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await locking;
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('cleanupLeftoverSessionDirs', () => {
  it('ölü süreçlerin afv-dec-* dizinlerini siler; canlı süreçlerinkine ve aktif oturuma dokunmaz', async () => {
    await unlock();
    const active = sessionDirOf(fx.udid)!;
    const dead = fs.mkdtempSync(path.join(os.tmpdir(), 'afv-dec-999999-'));
    fs.writeFileSync(path.join(dead, 'Manifest.db'), 'düz metin');
    const alive = fs.mkdtempSync(path.join(os.tmpdir(), 'afv-dec-888888-'));
    const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'afv-keep-'));
    try {
      const n = await cleanupLeftoverSessionDirs((pid) => pid === 888888);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(dead)).toBe(false);
      expect(fs.existsSync(alive)).toBe(true);
      expect(fs.existsSync(active)).toBe(true);
      expect(fs.existsSync(unrelated)).toBe(true);
    } finally {
      fs.rmSync(alive, { recursive: true, force: true });
      fs.rmSync(unrelated, { recursive: true, force: true });
    }
  });

  it('bu sürecin aktif olmayan (kilitlenmemiş kalıntı) dizini de silinir', async () => {
    const stale = fs.mkdtempSync(path.join(os.tmpdir(), `afv-dec-${process.pid}-`));
    await cleanupLeftoverSessionDirs(() => true);
    expect(fs.existsSync(stale)).toBe(false);
  });
});
