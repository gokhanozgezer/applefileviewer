// safeFs — salt-okunur fs gateway
// Bu modül tüm fs erişiminin geçtiği güvenlik kapısıdır.
// Sözleşme: copyFileOut, bilinen HERHANGİ bir yedek kökü (açık yedek, taranmış her
// yedek klasörü, default + override üst kökleri) altına yazma denemesini reddeder.
// Korunan kökler oturum boyunca YALNIZ BİRİKİR (override temizlense de eski kök
// korunmaya devam eder) — "son açılan yedek" dışındaki yedeklere yazma açığı kapanır.
// writeFileOut (export yazımı) aynı kontrolü uygular.
// Şifreli yedek çözümü (modules/crypto) için akış yazımı: openWriteStreamOut,
// renameOut, removeOut — hepsi AYNI korunan-kök kontrolünden geçer (yedeğe yazılamaz).
// Kilidi açık şifreli yedeğin oturum dizini: makeDecryptSessionDir / mkdirInDecryptSessionDir /
// removeDecryptSessionDir(Sync) — yalnız os.tmpdir()/afv-dec-* (keyfi dizin silme yok).
// Export edilMEYENLER: writeFile, unlink, rm, rename, mkdir, rmdir, createWriteStream.
//
// SECURITY MODEL — V1 scope
// safeFs.copyFileOut, path.resolve sonrası lexical scope check yapar.
// Bu kapsamın DIŞINDA kalan saldırı vektörleri:
//   - Windows junction / NTFS reparse point: junction yedek dışından yedek altına
//     point ediyorsa, junction path'i lexical check'i geçer ama gerçek hedefe
//     (yedek altına) düşen yazma olur.
//   - POSIX symlink: aynı mantık, sembolik link hedefi
//   - TOCTOU: dest path resolve'dan sonra rename edilirse
// V1 kabul gerekçesi: dest path'leri ya kullanıcı dialog'undan (folder picker)
// ya da uygulama-içi sabit konumlardan (userData/cache, os.tmpdir) geliyor.
// Renderer compromise için Electron sandbox + contextIsolation = true zaten var.
// V2 scope'u: fs.realpath enforcement + dest creation öncesi/sonrası realpath
// doğrulaması.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ─── Hata sınıfı ─────────────────────────────────────────────────────────────

export class BackupWriteForbiddenError extends Error {
  readonly code = 'BACKUP_WRITE_FORBIDDEN' as const;
  constructor(public readonly target: string) {
    super(`Backup write forbidden: ${target}`);
    this.name = 'BackupWriteForbiddenError';
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

let _backupRoot: string | null = null;
// Normalize (resolve + win32'de lowercase) edilmiş korunan kökler
const _protectedRoots = new Set<string>();

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeRoot(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isUnderRoot(target: string, root: string): boolean {
  if (target === root) return true;
  // Kök zaten ayırıcıyla bitiyorsa (ör. "D:\\") ek ayırıcı ekleme
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return target.startsWith(prefix);
}

function isUnderProtectedRoot(absResolved: string): boolean {
  const target = normalizeRoot(absResolved);
  for (const root of _protectedRoots) {
    if (isUnderRoot(target, root)) return true;
  }
  return false;
}

const NUL = String.fromCharCode(0);

function assertAbsolute(fn: string, absPath: unknown): asserts absPath is string {
  if (typeof absPath !== 'string') {
    throw new Error(`safeFs.${fn}: string bekleniyor, alındı: ` + typeof absPath);
  }
  if (!absPath) {
    throw new Error(`safeFs.${fn}: boş path`);
  }
  if (absPath.includes(NUL)) {
    throw new Error(`safeFs.${fn}: null byte içeren path`);
  }
  if (!path.isAbsolute(absPath)) {
    throw new Error(`safeFs.${fn}: absolute path bekleniyor, alındı: ` + absPath);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Açılan yedeğin klasörü — hem "aktif kök" olur hem korunan kökler kümesine eklenir. */
export function setBackupRoot(absPath: string): void {
  assertAbsolute('setBackupRoot', absPath);
  _backupRoot = path.resolve(absPath);
  _protectedRoots.add(normalizeRoot(_backupRoot));
}

export function getBackupRoot(): string | null {
  return _backupRoot;
}

/**
 * Yazmaya kapalı kökleri ekler: taranan yedek üst kökleri (default + override) ve
 * her yedek klasörü. Geçersiz (mutlak olmayan / boş) girdiler sessizce atlanır —
 * çağıran taraf store'dan gelen ham değeri geçebilir.
 */
export function protectBackupRoots(absPaths: readonly (string | null | undefined)[]): void {
  for (const p of absPaths) {
    if (typeof p !== 'string' || !p || p.includes(NUL) || !path.isAbsolute(p)) continue;
    _protectedRoots.add(normalizeRoot(p));
  }
}

/** Korunan kökler (normalize edilmiş) — tanılama + test. */
export function getProtectedRoots(): string[] {
  return [..._protectedRoots];
}

/** Test-only: korunan kök kümesini ve aktif kökü sıfırlar. */
export function _resetProtectedRootsForTest(): void {
  _protectedRoots.clear();
  _backupRoot = null;
}

// Okuma fonksiyonları — herhangi bir path için kullanılabilir
// (Lightbox cache erişimi, yedek dışı plist okuma vb.)
export const readFile = fsp.readFile.bind(fsp);
export const stat = fsp.stat.bind(fsp);
export const readdir = fsp.readdir.bind(fsp);
export const createReadStream = fs.createReadStream.bind(fs);
export const existsSync = fs.existsSync.bind(fs);

/** Dest path'i doğrular: null byte yok + korunan hiçbir kök altında değil → resolve edilmiş path. */
function resolveOutsideProtected(dest: unknown): string {
  if (typeof dest !== 'string' || dest.includes(NUL)) {
    throw new BackupWriteForbiddenError(String(dest));
  }
  const resolved = path.resolve(dest);
  if (isUnderProtectedRoot(resolved)) {
    throw new BackupWriteForbiddenError(resolved);
  }
  return resolved;
}

// Yazma fonksiyonları — yalnızca korunan yedek köklerinin dışına izin verir
export async function copyFileOut(src: string, dest: string): Promise<void> {
  // Null byte defansif reject + scope check (resolve sonrası korunan herhangi bir kök
  // altına düşüyorsa reddedilir) — file system call öncesinde
  const resolved = resolveOutsideProtected(dest);

  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.copyFile(src, resolved);
}

/**
 * Export yazımı (kullanıcının seçtiği hedef) — copyFileOut ile AYNI korunan-kök kontrolü.
 * Tüm export yazımları (tek dosya kaydet, notlar klasörü) buradan geçer: dialog'da
 * yedek klasörü içi seçilse bile yedeğe yazılmaz (BackupWriteForbiddenError).
 */
export async function writeFileOut(dest: string, data: string | Buffer): Promise<void> {
  const resolved = resolveOutsideProtected(dest);
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.writeFile(resolved, data);
}

/**
 * Korunan köklerin DIŞINA akış yazımı (şifreli yedek çözümü: GB'lık dosyalar belleğe
 * alınmadan yazılır). Üst dizin oluşturulur; dest korunan kök altındaysa
 * BackupWriteForbiddenError. Dönen stream'i çağıran pipeline ile tüketir.
 */
export async function openWriteStreamOut(dest: string): Promise<fs.WriteStream> {
  const resolved = resolveOutsideProtected(dest);
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  return fs.createWriteStream(resolved);
}

/** Atomik yeniden adlandırma (geçici → final) — İKİ uç da korunan köklerin dışında olmalı. */
export async function renameOut(src: string, dest: string): Promise<void> {
  const from = resolveOutsideProtected(src);
  const to = resolveOutsideProtected(dest);
  await fsp.rename(from, to);
}

/** Korunan köklerin dışındaki bir dosyayı siler (yarım çıktı temizliği). Yoksa sessiz. */
export async function removeOut(target: string): Promise<void> {
  const resolved = resolveOutsideProtected(target);
  await fsp.rm(resolved, { force: true });
}

// ─── Şifre çözüm oturum dizinleri (os.tmpdir()/afv-dec-*) ─────────────────────
// Kilidi açılmış şifreli yedeğin düz metin çıktıları (Manifest.db, çözülmüş dosyalar,
// türetilmiş thumbnail/transcode) YALNIZ bu dizinlerde yaşar; kilitte/çıkışta/açılışta
// komple silinir. Özyinelemeli silme yalnız os.tmpdir()'in DOĞRUDAN altındaki,
// bu önekle başlayan dizinlere izinlidir — keyfi dizin silme yüzeyi açılmaz.

export const DECRYPT_DIR_PREFIX = 'afv-dec-';

/** Dizin os.tmpdir()'in doğrudan çocuğu ve afv-dec- önekli mi (silinebilir oturum dizini). */
export function isDecryptSessionDir(absPath: unknown): absPath is string {
  if (typeof absPath !== 'string' || absPath.includes(NUL) || !path.isAbsolute(absPath)) {
    return false;
  }
  const resolved = path.resolve(absPath);
  const parent = normalizeRoot(path.dirname(resolved));
  return (
    parent === normalizeRoot(os.tmpdir()) && path.basename(resolved).startsWith(DECRYPT_DIR_PREFIX)
  );
}

/**
 * os.tmpdir() altında benzersiz, yalnız sahibinin erişebildiği (POSIX 0700) oturum dizini
 * oluşturur: <tmp>/afv-dec-<tag>-<rastgele>. tag (ör. pid) açılış temizliğinde canlı
 * sürecin dizinine dokunmamak için kullanılır.
 */
export async function makeDecryptSessionDir(tag: string): Promise<string> {
  if (!/^[A-Za-z0-9]{1,32}$/.test(tag))
    throw new Error('safeFs.makeDecryptSessionDir: geçersiz tag');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `${DECRYPT_DIR_PREFIX}${tag}-`));
  resolveOutsideProtected(dir); // tmpdir bir yedek kökü altındaysa (patolojik) reddet
  if (process.platform !== 'win32') await fsp.chmod(dir, 0o700);
  return dir;
}

/** Oturum dizini içinde alt dizin oluşturur (ör. cache/). Dışına çıkan yol reddedilir. */
export async function mkdirInDecryptSessionDir(sessionDir: string, absPath: string): Promise<void> {
  if (!isDecryptSessionDir(sessionDir)) throw new BackupWriteForbiddenError(String(sessionDir));
  const resolved = path.resolve(absPath);
  if (!isUnderRoot(normalizeRoot(resolved), normalizeRoot(sessionDir))) {
    throw new BackupWriteForbiddenError(resolved);
  }
  await fsp.mkdir(resolved, { recursive: true });
}

/**
 * Oturum dizinini komple siler (Windows'ta kısa süreli EBUSY/EPERM için yeniden dener).
 * Yalnız isDecryptSessionDir olan yollar kabul edilir; yoksa sessiz.
 */
export async function removeDecryptSessionDir(dir: string): Promise<void> {
  if (!isDecryptSessionDir(dir)) throw new BackupWriteForbiddenError(String(dir));
  await fsp.rm(path.resolve(dir), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}

/** Senkron sürüm — yalnız çıkışta (will-quit) son çare temizliği için. */
export function removeDecryptSessionDirSync(dir: string): void {
  if (!isDecryptSessionDir(dir)) throw new BackupWriteForbiddenError(String(dir));
  fs.rmSync(path.resolve(dir), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

// AÇIKÇA EXPORT EDİLMEYENLER (yüzey kontratı):
// writeFile, unlink, rm, rename, mkdir, rmdir, createWriteStream
