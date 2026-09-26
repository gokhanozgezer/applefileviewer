// backupRef — renderer'dan gelen IPC payload'larının doğrulanması (savunma derinliği).
// Sözleşme: udid/rootPath içeren her IPC isteği modül katmanına inmeden önce
// assertBackupRef'ten geçer; rootPath yalnızca uygulamanın kendisinin taradığı
// köklerden biri olabilir (default MobileSync yolu + kullanıcı override'ı).
// Electron sandbox + contextIsolation birincil savunmadır; bu katman renderer
// compromise durumunda keyfi disk okumasını engeller.

import path from 'node:path';

export class InvalidBackupRefError extends Error {
  readonly code = 'INVALID_BACKUP_REF' as const;
  constructor(reason: string) {
    super(`[INVALID_BACKUP_REF] Geçersiz backup referansı: ${reason}`);
    this.name = 'InvalidBackupRefError';
  }
}

/**
 * Şifreli yedek — içeriği (Manifest.db, dosyalar) şifre çözülmeden okunamaz.
 * Mesaj başındaki [BACKUP_ENCRYPTED] etiketi IPC sınırını geçer (Electron invoke
 * hatasında yalnız message taşınır) → renderer @shared/ipc ipcErrorCode ile ayırt eder.
 */
export class BackupEncryptedError extends Error {
  readonly code = 'BACKUP_ENCRYPTED' as const;
  constructor(udid: string) {
    super(`[BACKUP_ENCRYPTED] Şifreli yedek açılamaz: ${udid}`);
    this.name = 'BackupEncryptedError';
  }
}

// scan.ts / protocol.ts ile aynı biçimler
const UDID_RE = /^[a-f0-9-]{25,40}$/i;
const FILE_ID_RE = /^[a-f0-9]{40}$/i;

function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isValidUdid(udid: unknown): udid is string {
  return typeof udid === 'string' && UDID_RE.test(udid);
}

export function isValidFileId(fileId: unknown): fileId is string {
  return typeof fileId === 'string' && FILE_ID_RE.test(fileId);
}

/**
 * udid biçimini ve rootPath'in izinli kökler listesinde olduğunu doğrular.
 * allowedRoots boşsa hiçbir rootPath kabul edilmez.
 */
export function assertBackupRef(
  req: unknown,
  allowedRoots: readonly string[],
): asserts req is { udid: string; rootPath: string } {
  if (typeof req !== 'object' || req === null) {
    throw new InvalidBackupRefError('payload nesne değil');
  }
  const { udid, rootPath } = req as { udid?: unknown; rootPath?: unknown };
  if (!isValidUdid(udid)) {
    throw new InvalidBackupRefError('udid biçimi geçersiz');
  }
  if (typeof rootPath !== 'string' || rootPath.includes('\0') || !path.isAbsolute(rootPath)) {
    throw new InvalidBackupRefError('rootPath mutlak yol değil');
  }
  const norm = normalizePath(rootPath);
  if (!allowedRoots.some((root) => normalizePath(root) === norm)) {
    throw new InvalidBackupRefError('rootPath taranan kökler arasında değil');
  }
}

/** fileId içeren istekler (export/copyMedia, showInFolder, media/preheat) için ek doğrulama. */
export function assertFileId(fileId: unknown): asserts fileId is string {
  if (!isValidFileId(fileId)) {
    throw new InvalidBackupRefError('fileId biçimi geçersiz (40 haneli hex bekleniyor)');
  }
}

/** Kayıt sorgusu — guard registry'yi enjekte eder (test edilebilirlik). */
export type BackupLookup = (
  udid: string,
  rootPath: string,
) => { isEncrypted: boolean; encryptionUnknown?: boolean; unlocked?: boolean } | undefined;

/** Manifest.plist okunamadıysa şifreleme bilinmez → yedek açılamaz (fail closed). */
export function encryptionUnknownError(): InvalidBackupRefError {
  return new InvalidBackupRefError(
    'Manifest.plist okunamadı — şifreleme durumu bilinmiyor, yedek açılamaz',
  );
}

/**
 * assertBackupRef + yedeğin uygulamaca taranmış/açılmış olması + şifreli ise KİLİDİNİN
 * AÇIK olması. Liste handler'ları (fotoğraf, mesaj, export...) bundan geçer: bilinmeyen
 * yedek INVALID_BACKUP_REF, kilitli şifreli yedek BACKUP_ENCRYPTED ile reddedilir.
 * Şifrelemesi bilinmeyen yedek kilit açılsa da reddedilir (fail closed).
 */
export function assertUsableBackupRef(
  req: unknown,
  allowedRoots: readonly string[],
  lookup: BackupLookup,
): asserts req is { udid: string; rootPath: string } {
  assertBackupRef(req, allowedRoots);
  const entry = lookup(req.udid, req.rootPath);
  if (!entry) {
    throw new InvalidBackupRefError('yedek taranmamış veya bilinmiyor');
  }
  if (entry.encryptionUnknown) {
    throw encryptionUnknownError();
  }
  if (entry.isEncrypted && entry.unlocked !== true) {
    throw new BackupEncryptedError(req.udid);
  }
}
