import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  assertBackupRef,
  assertUsableBackupRef,
  assertFileId,
  isValidUdid,
  isValidFileId,
  InvalidBackupRefError,
} from '../../../src/main/modules/backup/backupRef';

const ROOT = path.resolve('C:\\Users\\test\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup');
const OVERRIDE = path.resolve('D:\\Yedekler\\iphone');
const ALLOWED = [ROOT, OVERRIDE] as const;
const UDID = '00008101-000A1B2C3D4E5F01';
const FILE_ID = 'a'.repeat(40);

describe('assertBackupRef', () => {
  it('izinli kökteki geçerli udid ile geçer', () => {
    expect(() => assertBackupRef({ udid: UDID, rootPath: ROOT }, ALLOWED)).not.toThrow();
  });

  it('override kökünü de kabul eder', () => {
    expect(() => assertBackupRef({ udid: UDID, rootPath: OVERRIDE }, ALLOWED)).not.toThrow();
  });

  it('büyük/küçük harf farkını (win32) tolere eder', () => {
    if (process.platform !== 'win32') return;
    expect(() =>
      assertBackupRef({ udid: UDID, rootPath: ROOT.toUpperCase() }, ALLOWED),
    ).not.toThrow();
  });

  it('izinli listede olmayan rootPath reddedilir', () => {
    expect(() =>
      assertBackupRef({ udid: UDID, rootPath: path.resolve('C:\\Windows\\System32') }, ALLOWED),
    ).toThrow(InvalidBackupRefError);
  });

  it('kök altındaki alt klasör bile reddedilir (tam eşleşme şart)', () => {
    expect(() => assertBackupRef({ udid: UDID, rootPath: path.join(ROOT, UDID) }, ALLOWED)).toThrow(
      InvalidBackupRefError,
    );
  });

  it('göreli rootPath reddedilir', () => {
    expect(() => assertBackupRef({ udid: UDID, rootPath: '..\\..\\etc' }, ALLOWED)).toThrow(
      InvalidBackupRefError,
    );
  });

  it('null byte içeren rootPath reddedilir', () => {
    expect(() => assertBackupRef({ udid: UDID, rootPath: ROOT + '\0x' }, ALLOWED)).toThrow(
      InvalidBackupRefError,
    );
  });

  it('geçersiz udid biçimi reddedilir', () => {
    expect(() => assertBackupRef({ udid: '../evil', rootPath: ROOT }, ALLOWED)).toThrow(
      InvalidBackupRefError,
    );
    expect(() => assertBackupRef({ udid: 'kısa', rootPath: ROOT }, ALLOWED)).toThrow(
      InvalidBackupRefError,
    );
  });

  it('nesne olmayan payload reddedilir', () => {
    expect(() => assertBackupRef(null, ALLOWED)).toThrow(InvalidBackupRefError);
    expect(() => assertBackupRef('str', ALLOWED)).toThrow(InvalidBackupRefError);
    expect(() => assertBackupRef(undefined, ALLOWED)).toThrow(InvalidBackupRefError);
  });

  it('boş izinli liste her şeyi reddeder', () => {
    expect(() => assertBackupRef({ udid: UDID, rootPath: ROOT }, [])).toThrow(
      InvalidBackupRefError,
    );
  });
});

describe('assertFileId / isValidFileId', () => {
  it('40 haneli hex geçer', () => {
    expect(() => assertFileId(FILE_ID)).not.toThrow();
    expect(isValidFileId('ABCDEF0123456789abcdef0123456789abcdef01')).toBe(true);
  });

  it('traversal ve yanlış uzunluk reddedilir', () => {
    expect(() => assertFileId('..\\..\\evil')).toThrow(InvalidBackupRefError);
    expect(() => assertFileId('a'.repeat(39))).toThrow(InvalidBackupRefError);
    expect(() => assertFileId('a'.repeat(41))).toThrow(InvalidBackupRefError);
    expect(() => assertFileId('g'.repeat(40))).toThrow(InvalidBackupRefError);
    expect(() => assertFileId(42)).toThrow(InvalidBackupRefError);
  });
});

describe('isValidUdid', () => {
  it('modern (dash) ve eski (40 hex) udid biçimleri geçer', () => {
    expect(isValidUdid('00008101-000A1B2C3D4E5F01')).toBe(true);
    expect(isValidUdid('a'.repeat(40))).toBe(true);
  });

  it('geçersizler reddedilir', () => {
    expect(isValidUdid('..')).toBe(false);
    expect(isValidUdid('a'.repeat(24))).toBe(false);
    expect(isValidUdid(null)).toBe(false);
  });
});

describe('assertUsableBackupRef — şifreli yedek kilidi', () => {
  const ref = { udid: UDID, rootPath: ROOT };
  it('kilitli şifreli → BACKUP_ENCRYPTED; kilidi açık → geçer', () => {
    expect(() =>
      assertUsableBackupRef(ref, ALLOWED, () => ({ isEncrypted: true, unlocked: false })),
    ).toThrow(/BACKUP_ENCRYPTED/);
    expect(() =>
      assertUsableBackupRef(ref, ALLOWED, () => ({ isEncrypted: true, unlocked: true })),
    ).not.toThrow();
  });

  it('şifrelemesi bilinmeyen yedek kilit bayrağı olsa da reddedilir (fail closed)', () => {
    expect(() =>
      assertUsableBackupRef(ref, ALLOWED, () => ({
        isEncrypted: true,
        encryptionUnknown: true,
        unlocked: true,
      })),
    ).toThrow(/INVALID_BACKUP_REF/);
  });
});
