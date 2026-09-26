// backupRegistry — taranan/açılan yedeklerin oturum-içi kaydı (udid + rootPath → şifreli mi).
// Guard (IPC) ve backup:// protokolü şifreli yedeği MAIN tarafında reddetmek için buna bakar;
// renderer'daki engel tek başına yeterli değil (compromise / eski sekme / deep link).
// Senkron sorgu: guard `asserts` imzalı ve senkron — plist okuması scan/open'da yapılır,
// burada yalnız sonucu tutulur. Electron'suz → birim test edilebilir.

import path from 'node:path';
import type { BackupSummary } from '@shared/domain';

export interface RegisteredBackup {
  udid: string;
  rootPath: string;
  isEncrypted: boolean;
  /** Manifest.plist okunamadı — şifreleme bilinmiyor; guard/protokol fail closed. */
  encryptionUnknown: boolean;
}

type RegisterInput = Pick<BackupSummary, 'udid' | 'rootPath' | 'isEncrypted'> &
  Partial<Pick<BackupSummary, 'encryptionUnknown'>>;

const byKey = new Map<string, RegisteredBackup>();

function normRoot(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function keyOf(udid: string, rootPath: string): string {
  return `${normRoot(rootPath)}|${udid.toLowerCase()}`;
}

export function registerBackup(b: RegisterInput): void {
  byKey.set(keyOf(b.udid, b.rootPath), {
    udid: b.udid,
    rootPath: b.rootPath,
    isEncrypted: b.isEncrypted,
    encryptionUnknown: b.encryptionUnknown === true,
  });
}

/**
 * Tam tarama sonucuyla kaydı DEĞİŞTİRİR — diskten silinen / şifrelemesi değişen
 * yedekler bayat kalmasın (BACKUP_RESCAN).
 */
export function replaceRegistry(backups: readonly RegisterInput[]): void {
  byKey.clear();
  for (const b of backups) registerBackup(b);
}

export function lookupBackup(udid: string, rootPath: string): RegisteredBackup | undefined {
  return byKey.get(keyOf(udid, rootPath));
}

/**
 * backup:// yalnız udid bilir — aynı udid'in HERHANGİ bir kökte şifreli VEYA şifrelemesi
 * bilinmeyen (Manifest.plist okunamadı — fail closed) kaydı varsa true.
 */
export function isUdidEncrypted(udid: string): boolean {
  const u = udid.toLowerCase();
  for (const b of byKey.values()) {
    if ((b.isEncrypted || b.encryptionUnknown) && b.udid.toLowerCase() === u) return true;
  }
  return false;
}

/** Test-only */
export function _resetBackupRegistry(): void {
  byKey.clear();
}
