// encryptedSessions — kilidi açılmış şifreli yedek oturumlarının bellek-içi kaydı (udid → oturum).
// Electron'suz → birim test edilebilir. IPC (ipc/backup.ts) guard/registry doğrulamasını yapar,
// burası yalnız kripto oturumu + düz metin dizini yaşam döngüsünü yönetir.
//
// ─── Güvenlik modeli ─────────────────────────────────────────────────────────
//   - Parola yalnız openEncryptedBackup'a geçer; saklanmaz, loglanmaz, hata mesajına girmez.
//   - Sınıf anahtarları yalnız bellekte (EncryptedBackupSession); kilitte dispose() sıfırlar.
//   - TÜM düz metin (çözülmüş Manifest.db, istek üzerine çözülen dosyalar, -wal/-shm yan
//     dosyaları, oturumun thumbnail/transcode/orig-jpeg cache'i) TEK bir oturum dizininde:
//       os.tmpdir()/afv-dec-<pid>-<rastgele>/
//         Manifest.db             — çözülmüş manifest (kalıcı bağlantı, fileID sorgusu)
//         <xx>/<fileId>           — tembel çözülen yedek dosyaları (atomik: .part → rename)
//         cache/                  — oturuma özel medya cache'i (protocol → cache.ts)
//     Çözülmüş SQLite'lar YERİNDE açılır (util/sqlite openReadOnlyInPlace) — TMP_CACHE_DIR'e
//     ikinci kopya yazılmaz. Arama korpusu (bellek) kilitte bu dizini anahtarında taşıyan
//     girdilerden temizlenir.
//   - Silme noktaları: backup:lock, pencere kapanışı, before-quit (async) + will-quit (sync
//     son çare), açılışta ölü süreçlerden kalan afv-dec-* dizinleri (çökme kurtarma).

import os from 'node:os';
import path from 'node:path';
import {
  openEncryptedBackup,
  WrongPasswordError,
  FILE_FLAGS,
  type EncryptedBackupSession,
} from '@main/modules/crypto';
import {
  DECRYPT_DIR_PREFIX,
  existsSync,
  isDecryptSessionDir,
  makeDecryptSessionDir,
  mkdirInDecryptSessionDir,
  readdir,
  removeDecryptSessionDir,
  removeDecryptSessionDirSync,
} from '@main/safeFs';
import { openReadOnlyInPlace, type ReadOnlyDb } from '@main/util/sqlite';
import { purgeCorpus } from '@main/modules/search/corpusCache';
import { fileIdToBackupPath } from '@main/modules/manifest/fileId';

export type UnlockOutcome =
  | { status: 'ok' }
  | { status: 'wrongPassword' }
  | { status: 'error'; message: string };

interface DecryptJob {
  promise: Promise<string>;
  controller: AbortController;
  /** İptal edilebilir (signal'li) bekleyen sayısı; signal'siz bekleyen varsa iş iptal edilmez. */
  waiters: number;
  pinned: boolean;
}

interface UnlockedSession {
  udid: string;
  rootPath: string;
  /** <rootPath>/<udid> — şifreli yedek klasörü. */
  backupDir: string;
  /** os.tmpdir()/afv-dec-* — tüm düz metin burada. */
  dir: string;
  crypto: EncryptedBackupSession;
  manifest: ReadOnlyDb;
  lookup: (fileId: string) => { flags: number; file: Buffer | null } | undefined;
  jobs: Map<string, DecryptJob>;
  /** Kilitte tüm süren çözümleri iptal eder. */
  abort: AbortController;
}

const sessions = new Map<string, UnlockedSession>(); // anahtar: udid (küçük harf)
const unlocking = new Set<string>();

function normPath(p: string): string {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function keyOf(udid: string): string {
  return udid.toLowerCase();
}

function abortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

/** Hata mesajı — kripto hataları zaten güvenli metin taşır; parola hiçbir yola girmez. */
function safeMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── Kilit açma / kilitleme ──────────────────────────────────────────────────

/**
 * Şifreli yedeğin kilidini açar: PBKDF2 (async, libuv threadpool — main thread bloke olmaz)
 * → Manifest.db oturum dizinine çözülür → oturum udid ile kaydedilir.
 * Çağıran (IPC) yedeğin taranmış + şifreli olduğunu ÖNCEDEN doğrular.
 */
export async function unlockEncryptedBackup(req: {
  udid: string;
  rootPath: string;
  password: string;
}): Promise<UnlockOutcome> {
  const key = keyOf(req.udid);
  const existing = sessions.get(key);
  if (existing && normPath(existing.rootPath) === normPath(req.rootPath)) return { status: 'ok' };
  if (unlocking.has(key)) return { status: 'error', message: 'Kilit açma zaten sürüyor' };
  unlocking.add(key);

  const backupDir = path.join(req.rootPath, req.udid);
  let cryptoSession: EncryptedBackupSession | null = null;
  let dir: string | null = null;
  let manifest: ReadOnlyDb | null = null;
  try {
    cryptoSession = await openEncryptedBackup(backupDir, req.password);
    dir = await makeDecryptSessionDir(String(process.pid));
    const manifestAbs = path.join(dir, 'Manifest.db');
    await cryptoSession.decryptManifestDb(manifestAbs);
    manifest = openReadOnlyInPlace(manifestAbs);
    // Şema doğrulaması (Files tablosu + kolonlar) — prepare eksik kolonda fırlatır.
    const stmt = manifest.prepare('SELECT flags, file FROM Files WHERE fileID = ?');
    // Aynı udid başka bir kökte açıksa önce onu kapat (tek oturum / udid).
    if (existing) await lockEncryptedBackup(req.udid);
    sessions.set(key, {
      udid: req.udid,
      rootPath: req.rootPath,
      backupDir,
      dir,
      crypto: cryptoSession,
      manifest,
      lookup: (fileId) => stmt.get(fileId) as { flags: number; file: Buffer | null } | undefined,
      jobs: new Map(),
      abort: new AbortController(),
    });
    return { status: 'ok' };
  } catch (e) {
    try {
      manifest?.close();
    } catch {
      /* zaten kapalı */
    }
    cryptoSession?.dispose();
    if (dir) await removeDecryptSessionDir(dir).catch(() => undefined);
    if (e instanceof WrongPasswordError) return { status: 'wrongPassword' };
    return { status: 'error', message: safeMessage(e) };
  } finally {
    unlocking.delete(key);
  }
}

async function disposeSession(s: UnlockedSession): Promise<void> {
  s.abort.abort();
  // Süren çözümler iptal edilir; akışlar kapanmadan (Windows) silme EBUSY verir.
  await Promise.allSettled([...s.jobs.values()].map((j) => j.promise));
  s.jobs.clear();
  try {
    s.manifest.close();
  } catch {
    /* ignore */
  }
  s.crypto.dispose();
  purgeCorpus((k) => k.includes(s.dir));
  await removeDecryptSessionDir(s.dir);
}

/**
 * Oturumu kapatır: süren çözümler iptal, anahtarlar sıfırlanır, bellek-içi korpus
 * temizlenir, oturum dizini (tüm düz metin) silinir. Oturum yoksa false.
 */
export async function lockEncryptedBackup(udid: string): Promise<boolean> {
  const s = sessions.get(keyOf(udid));
  if (!s) return false;
  sessions.delete(keyOf(udid)); // önce kayıttan düş — yeni istekler kilitli görsün
  await disposeSession(s);
  return true;
}

/** Tüm oturumları kilitler (pencere kapanışı / before-quit). Hata biriktirir, yarıda kesmez. */
export async function lockAllEncryptedBackups(): Promise<string[]> {
  const all = [...sessions.values()];
  sessions.clear();
  const errors: string[] = [];
  for (const s of all) {
    try {
      await disposeSession(s);
    } catch (e) {
      errors.push(safeMessage(e));
    }
  }
  return errors;
}

/** Senkron son çare (will-quit): anahtarları sıfırla, dizinleri sil. */
export function wipeAllSessionsSync(): void {
  const all = [...sessions.values()];
  sessions.clear();
  for (const s of all) {
    s.abort.abort();
    try {
      s.manifest.close();
    } catch {
      /* ignore */
    }
    s.crypto.dispose();
    purgeCorpus((k) => k.includes(s.dir));
    try {
      removeDecryptSessionDirSync(s.dir);
    } catch {
      /* açılış temizliği toplar */
    }
  }
}

export function hasUnlockedSessions(): boolean {
  return sessions.size > 0;
}

// ─── Sorgular ────────────────────────────────────────────────────────────────

export function isBackupUnlocked(udid: string, rootPath: string): boolean {
  const s = sessions.get(keyOf(udid));
  return !!s && normPath(s.rootPath) === normPath(rootPath);
}

export function isUdidUnlocked(udid: string): boolean {
  return sessions.has(keyOf(udid));
}

/** Oturum dizini (yoksa null) — tanılama + test. */
export function sessionDirOf(udid: string): string | null {
  return sessions.get(keyOf(udid))?.dir ?? null;
}

/**
 * Oturuma özel medya cache kökü (<oturum>/cache) — protocol thumbnail/transcode/orig-jpeg'i
 * buraya yazar; kilitte oturumla silinir. Kilitli/şifresiz yedekte null (genel cache).
 */
export async function sessionCacheDir(udid: string): Promise<string | null> {
  const s = sessions.get(keyOf(udid));
  if (!s) return null;
  const dir = path.join(s.dir, 'cache');
  await mkdirInDecryptSessionDir(s.dir, dir);
  return dir;
}

/** Yol herhangi bir aktif oturum dizininin altında mı (çözülmüş düz metin). */
export function isDecryptedPath(absPath: string): boolean {
  const t = normPath(absPath);
  for (const s of sessions.values()) {
    const d = normPath(s.dir);
    if (t.startsWith(d + path.sep)) return true;
  }
  return false;
}

// ─── Tembel dosya çözümü ─────────────────────────────────────────────────────

function waitJob(job: DecryptJob, signal?: AbortSignal): Promise<string> {
  if (!signal) {
    job.pinned = true; // iptal edilemeyen bekleyen — iş sonuna dek sürer
    return job.promise;
  }
  if (signal.aborted) return Promise.reject(abortError());
  job.waiters += 1;
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      job.waiters -= 1;
      // Son iptal edilebilir bekleyen de gitti ve iptal edilemeyen yok → işi durdur
      if (job.waiters === 0 && !job.pinned) job.controller.abort();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    job.promise.then(
      (v) => {
        if (settled) return;
        settled = true;
        job.waiters -= 1;
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        if (settled) return;
        settled = true;
        job.waiters -= 1;
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/**
 * Kilidi açık oturumda fileId'yi çözülmüş düz dosya yoluna çevirir:
 * <oturum>/<xx>/<fileId>. Manifest'te kayıt yoksa / dosya değilse null.
 * Eşzamanlı istekler tek çözüme bağlanır (in-flight dedupe); signal'li bekleyenlerin
 * hepsi iptal ederse çözüm de iptal edilir (yarım çıktı silinir).
 * Oturum yoksa (kilitli) veya backupRoot oturumun yedeği değilse null.
 */
export async function materializeEncryptedFile(
  udid: string,
  backupRoot: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const s = sessions.get(keyOf(udid));
  // Oturum yok (kilitli) ya da aynı udid'in BAŞKA bir kökteki kopyası → çözüm yok
  if (!s || normPath(s.backupDir) !== normPath(backupRoot)) return null;
  signal?.throwIfAborted();
  const out = path.join(s.dir, fileId.slice(0, 2), fileId);

  let job = s.jobs.get(fileId);
  if (!job) {
    // Atomik yazım (.part → rename): final yol varsa içerik tam.
    if (existsSync(out)) return out;
    const row = s.lookup(fileId);
    if (!row || row.flags !== FILE_FLAGS.FILE || !row.file) return null;
    const record = s.crypto.parseFileRecord(row.file);
    const controller = new AbortController();
    const onSessionAbort = (): void => controller.abort();
    s.abort.signal.addEventListener('abort', onSessionAbort, { once: true });
    const created: DecryptJob = {
      controller,
      waiters: 0,
      pinned: false,
      promise: s.crypto
        .decryptFileTo(fileIdToBackupPath(s.backupDir, fileId), out, record, controller.signal)
        .then(() => out)
        .finally(() => {
          s.abort.signal.removeEventListener('abort', onSessionAbort);
          if (s.jobs.get(fileId) === created) s.jobs.delete(fileId);
        }),
    };
    created.promise.catch(() => undefined); // tüm bekleyenler ayrılsa da unhandled olmasın
    s.jobs.set(fileId, created);
    job = created;
  }
  try {
    return await waitJob(job, signal);
  } catch (e) {
    // Manifest'te kayıt var ama yedekte blob yok → düz yedekteki "dosya yok" ile aynı: null
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Test yardımcısı — süren çözüm sayısı. */
export function _inFlightDecryptsForTest(udid: string): number {
  return sessions.get(keyOf(udid))?.jobs.size ?? 0;
}

// ─── Açılış temizliği (çökme kurtarma) ───────────────────────────────────────

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * os.tmpdir()'deki yetim afv-dec-<pid>-* dizinlerini siler: sahibi süreç ölmüşse
 * (çökme / zorla kapatma) veya ad biçimi tanınmıyorsa. Bu sürecin aktif oturumlarına
 * ve başka CANLI bir uygulama örneğinin dizinlerine dokunulmaz. Döner: silinen sayı.
 */
export async function cleanupLeftoverSessionDirs(
  isAlive: (pid: number) => boolean = isPidAlive,
): Promise<number> {
  const tmp = os.tmpdir();
  let names: string[];
  try {
    names = await readdir(tmp);
  } catch {
    return 0;
  }
  const active = new Set([...sessions.values()].map((s) => normPath(s.dir)));
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(DECRYPT_DIR_PREFIX)) continue;
    const abs = path.join(tmp, name);
    if (!isDecryptSessionDir(abs) || active.has(normPath(abs))) continue;
    const m = /^afv-dec-(\d+)-/.exec(name);
    const pid = m ? Number(m[1]) : NaN;
    if (Number.isFinite(pid) && pid !== process.pid && isAlive(pid)) continue;
    try {
      await removeDecryptSessionDir(abs);
      removed += 1;
    } catch {
      /* kilitli dosya — sonraki açılışta tekrar denenir */
    }
  }
  return removed;
}

/** Test-only — tüm oturumları senkron temizler. */
export function _resetEncryptedSessionsForTest(): void {
  wipeAllSessionsSync();
  unlocking.clear();
}
