// guard — IPC girdi doğrulama katmanı. store (electron-store) ve defaultPath
// (app.getPath) Electron'a bağlı olduğundan mock'lanır; registry gerçek modül.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(
  'C:\\Users\\test\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup',
);
const OVERRIDE_ROOT = path.resolve('D:\\Yedekler\\iphone');

const storeState: Record<string, unknown> = { 'ui.backupRootOverride': null };

vi.mock('@main/store', () => ({
  store: {
    get: (k: string) => storeState[k],
    set: (k: string, v: unknown) => {
      storeState[k] = v;
    },
  },
}));

vi.mock('@main/modules/backup/defaultPath', () => ({
  getDefaultBackupPaths: () => [DEFAULT_ROOT],
}));

// Statik import — vi.mock hoist edilir; factory'deki değişkenlere yalnız çağrı anında erişilir.
// (Dinamik import + destructure, asserts fonksiyonlarında TS2775 verir.)
import {
  guardBackupRef,
  guardBackupRefFormat,
  withBackupRef,
  getAllowedRoots,
  InvalidBackupRefError,
  BackupEncryptedError,
} from '@main/ipc/guard';
import {
  registerBackup,
  replaceRegistry,
  _resetBackupRegistry,
} from '@main/modules/backup/backupRegistry';
import { ipcErrorCode } from '@shared/ipc';

const UDID = 'abcdef0123456789abcdef0123456789abcdef01';
const ENC_UDID = '00008101-000A1B2C3D4E5F01';

describe('guard', () => {
  beforeEach(() => {
    storeState['ui.backupRootOverride'] = null;
    _resetBackupRegistry();
    registerBackup({ udid: UDID, rootPath: DEFAULT_ROOT, isEncrypted: false });
    registerBackup({ udid: ENC_UDID, rootPath: DEFAULT_ROOT, isEncrypted: true });
  });

  describe('getAllowedRoots', () => {
    it('override yokken yalnız default kök', () => {
      expect(getAllowedRoots()).toEqual([DEFAULT_ROOT]);
    });

    it('override set ise default + override', () => {
      storeState['ui.backupRootOverride'] = OVERRIDE_ROOT;
      expect(getAllowedRoots()).toEqual([DEFAULT_ROOT, OVERRIDE_ROOT]);
    });

    it('boş string / string olmayan override yok sayılır', () => {
      storeState['ui.backupRootOverride'] = '';
      expect(getAllowedRoots()).toEqual([DEFAULT_ROOT]);
      storeState['ui.backupRootOverride'] = 42;
      expect(getAllowedRoots()).toEqual([DEFAULT_ROOT]);
    });
  });

  describe('guardBackupRef', () => {
    it('kayıtlı, şifresiz, izinli kökteki yedek geçer', () => {
      expect(() => guardBackupRef({ udid: UDID, rootPath: DEFAULT_ROOT })).not.toThrow();
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'abc'],
      ['number', 42],
      ['array', [UDID, DEFAULT_ROOT]],
    ])('nesne olmayan payload (%s) reddedilir', (_n, payload) => {
      expect(() => guardBackupRef(payload)).toThrow(InvalidBackupRefError);
    });

    it.each([
      ['kısa', 'abc'],
      ['traversal', '../../Windows'],
      ['ayraçlı', `${UDID}/..`],
      ['ters bölü', `..\\${UDID}`],
      ['hex dışı', 'z'.repeat(40)],
      ['çok uzun', 'a'.repeat(41)],
      ['boş', ''],
    ])('bozuk udid (%s) reddedilir', (_n, udid) => {
      expect(() => guardBackupRef({ udid, rootPath: DEFAULT_ROOT })).toThrow(InvalidBackupRefError);
    });

    it.each([
      ['number', 123],
      ['object', { toString: () => UDID }],
      ['array', [UDID]],
    ])('string olmayan udid (%s) reddedilir', (_n, udid) => {
      expect(() => guardBackupRef({ udid, rootPath: DEFAULT_ROOT })).toThrow(InvalidBackupRefError);
    });

    it('string olmayan rootPath reddedilir', () => {
      expect(() => guardBackupRef({ udid: UDID, rootPath: 1 })).toThrow(InvalidBackupRefError);
      expect(() => guardBackupRef({ udid: UDID })).toThrow(InvalidBackupRefError);
    });

    it('göreli rootPath reddedilir', () => {
      expect(() => guardBackupRef({ udid: UDID, rootPath: 'Backup' })).toThrow(
        InvalidBackupRefError,
      );
    });

    it('path traversal ile izinli kökün dışına çıkan rootPath reddedilir', () => {
      const escaped = path.join(DEFAULT_ROOT, '..', '..');
      expect(() => guardBackupRef({ udid: UDID, rootPath: escaped })).toThrow(
        InvalidBackupRefError,
      );
      const sub = path.join(DEFAULT_ROOT, UDID);
      expect(() => guardBackupRef({ udid: UDID, rootPath: sub })).toThrow(InvalidBackupRefError);
    });

    it('traversal sonrası izinli köke normalize olan yol kabul edilir (lexical resolve)', () => {
      const roundTrip = path.join(DEFAULT_ROOT, 'x', '..');
      expect(() => guardBackupRef({ udid: UDID, rootPath: roundTrip })).not.toThrow();
    });

    it('null byte içeren rootPath reddedilir', () => {
      expect(() =>
        guardBackupRef({ udid: UDID, rootPath: DEFAULT_ROOT + String.fromCharCode(0) }),
      ).toThrow(InvalidBackupRefError);
    });

    it('izinli olmayan kök (override temizlenmiş) reddedilir', () => {
      registerBackup({ udid: UDID, rootPath: OVERRIDE_ROOT, isEncrypted: false });
      expect(() => guardBackupRef({ udid: UDID, rootPath: OVERRIDE_ROOT })).toThrow(
        InvalidBackupRefError,
      );
      storeState['ui.backupRootOverride'] = OVERRIDE_ROOT;
      expect(() => guardBackupRef({ udid: UDID, rootPath: OVERRIDE_ROOT })).not.toThrow();
    });

    it('bilinmeyen (taranmamış) yedek reddedilir', () => {
      const unknown = 'f'.repeat(40);
      expect(() => guardBackupRef({ udid: unknown, rootPath: DEFAULT_ROOT })).toThrow(/taranmamış/);
    });

    it('rescan sonrası kaybolan yedek reddedilir', () => {
      replaceRegistry([]);
      expect(() => guardBackupRef({ udid: UDID, rootPath: DEFAULT_ROOT })).toThrow(
        InvalidBackupRefError,
      );
    });

    it('şifreli yedek BACKUP_ENCRYPTED ile reddedilir', () => {
      let caught: unknown;
      try {
        guardBackupRef({ udid: ENC_UDID, rootPath: DEFAULT_ROOT });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BackupEncryptedError);
      expect((caught as InstanceType<typeof BackupEncryptedError>).code).toBe('BACKUP_ENCRYPTED');
      // IPC sınırından geçen mesaj biçimi renderer'da kodu geri verir
      const wire = new Error(`Error invoking remote method 'x': ${(caught as Error).message}`);
      expect(ipcErrorCode(wire)).toBe('BACKUP_ENCRYPTED');
    });

    it('INVALID_BACKUP_REF kodu mesajdan okunabilir', () => {
      try {
        guardBackupRef({ udid: 'x', rootPath: DEFAULT_ROOT });
      } catch (e) {
        expect(ipcErrorCode(e)).toBe('INVALID_BACKUP_REF');
        return;
      }
      throw new Error('throw bekleniyordu');
    });
  });

  describe('guardBackupRefFormat', () => {
    it('kayıt/şifre bakmaz — yalnız biçim + kök', () => {
      expect(() =>
        guardBackupRefFormat({ udid: 'f'.repeat(40), rootPath: DEFAULT_ROOT }),
      ).not.toThrow();
      expect(() => guardBackupRefFormat({ udid: ENC_UDID, rootPath: DEFAULT_ROOT })).not.toThrow();
      expect(() => guardBackupRefFormat({ udid: '../x', rootPath: DEFAULT_ROOT })).toThrow(
        InvalidBackupRefError,
      );
      expect(() => guardBackupRefFormat({ udid: UDID, rootPath: 'C:\\Windows' })).toThrow(
        InvalidBackupRefError,
      );
    });
  });

  describe('withBackupRef', () => {
    it('geçerli istekte handler çağrılır ve sonucu döner', async () => {
      const fn = vi.fn(async (req: { udid: string; rootPath: string }) => req.udid);
      const handler = withBackupRef(fn);
      await expect(handler({}, { udid: UDID, rootPath: DEFAULT_ROOT })).resolves.toBe(UDID);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('geçersiz / şifreli istekte handler HİÇ çağrılmaz', () => {
      const fn = vi.fn();
      const handler = withBackupRef(fn);
      expect(() =>
        handler({}, { udid: '..', rootPath: DEFAULT_ROOT } as { udid: string; rootPath: string }),
      ).toThrow(InvalidBackupRefError);
      expect(() => handler({}, { udid: ENC_UDID, rootPath: DEFAULT_ROOT })).toThrow(
        BackupEncryptedError,
      );
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
