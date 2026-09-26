import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import {
  registerBackup,
  replaceRegistry,
  lookupBackup,
  isUdidEncrypted,
  _resetBackupRegistry,
} from '@main/modules/backup/backupRegistry';
import { resolveBackupSource } from '@main/modules/backup/scan';

const ROOT = path.resolve('C:\\Backup');
const OTHER = path.resolve('D:\\Yedek');
const UDID = 'abcdef0123456789abcdef0123456789abcdef01';

describe('backupRegistry', () => {
  beforeEach(() => _resetBackupRegistry());

  it('kayıtlı yedeği udid + kök ile bulur', () => {
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: false });
    expect(lookupBackup(UDID, ROOT)?.isEncrypted).toBe(false);
    expect(lookupBackup(UDID, OTHER)).toBeUndefined();
  });

  it('udid büyük/küçük harf duyarsız', () => {
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: true });
    expect(lookupBackup(UDID.toUpperCase(), ROOT)).toBeDefined();
    expect(isUdidEncrypted(UDID.toUpperCase())).toBe(true);
  });

  it.skipIf(process.platform !== 'win32')('win32: kök büyük/küçük harf duyarsız', () => {
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: false });
    expect(lookupBackup(UDID, ROOT.toLowerCase())).toBeDefined();
  });

  it('replaceRegistry eski kayıtları düşürür', () => {
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: true });
    replaceRegistry([{ udid: UDID, rootPath: OTHER, isEncrypted: false }]);
    expect(lookupBackup(UDID, ROOT)).toBeUndefined();
    expect(isUdidEncrypted(UDID)).toBe(false);
  });

  it('şifrelemesi bilinmeyen (Manifest.plist okunamadı) kayıt protokolde şifreli sayılır — fail closed', () => {
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: false, encryptionUnknown: true });
    expect(isUdidEncrypted(UDID)).toBe(true);
    expect(lookupBackup(UDID, ROOT)?.encryptionUnknown).toBe(true);
  });

  it('isUdidEncrypted: bilinmeyen (kayıtsız) udid false', () => {
    expect(isUdidEncrypted(UDID)).toBe(false);
  });
});

describe('resolveBackupSource', () => {
  const ROOTS = [{ path: ROOT, source: 'itunes' as const }];
  it('varsayılan köke eşitse o kökün türü', () => {
    expect(resolveBackupSource(ROOT, ROOTS, OTHER)).toBe('itunes');
  });
  it('birden çok varsayılan kök — eşleşen kökün türü döner', () => {
    const roots = [...ROOTS, { path: OTHER, source: 'appleDevices' as const }];
    expect(resolveBackupSource(OTHER, roots, null)).toBe('appleDevices');
  });
  it('override köküne eşitse override', () => {
    expect(resolveBackupSource(OTHER, ROOTS, OTHER)).toBe('override');
  });
  it('override yoksa ilk varsayılan kök', () => {
    expect(resolveBackupSource(OTHER, ROOTS, null)).toBe('itunes');
  });
  it('varsayılan kök yoksa (Linux) override', () => {
    expect(resolveBackupSource(OTHER, [], null)).toBe('override');
  });
  it.skipIf(process.platform !== 'win32')('win32: harf farkı override eşleşmesini bozmaz', () => {
    expect(resolveBackupSource(OTHER.toUpperCase(), ROOTS, OTHER)).toBe('override');
  });
});
