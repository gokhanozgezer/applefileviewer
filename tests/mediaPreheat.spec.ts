import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// store (electron-store) + default MobileSync yolu Electron'suz test'te sahte.
const ROOT = path.resolve('/afv-test/MobileSync/Backup');
vi.mock('@main/store', () => ({ store: { get: () => undefined } }));
vi.mock('@main/modules/backup/defaultPath', () => ({
  getDefaultBackupRoots: () => [{ path: ROOT, source: 'itunes' }],
  getDefaultBackupPaths: () => [ROOT],
}));

// Transcode gerçek ffmpeg + Manifest.db ister — burada yalnız çağrı sözleşmesi test edilir.
const ensureTranscodedCache = vi.fn<(...args: unknown[]) => Promise<string>>();
vi.mock('@main/protocol', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureTranscodedCache: (...args: unknown[]) => ensureTranscodedCache(...args),
}));

import { assertPreheatRequest, preheat } from '@main/ipc/media';
import { rememberBackupRoot, clearBackupRootCache } from '@main/protocol';
import { registerBackup, _resetBackupRegistry } from '@main/modules/backup/backupRegistry';

const UDID = '00008030-001a2b3c4d5e6f70';
const FILE_ID = '3d0d7e5fb2ce288813306e4d4636395e047a3d28';
// BACKUP_OPEN'ın hatırladığı biçim: join(rootPath, udid); registry rootPath = izinli kök.
const DEVICE_ROOT = path.join(ROOT, UDID);

describe('assertPreheatRequest', () => {
  it('geçerli payload kabul', () => {
    expect(() => assertPreheatRequest({ udid: UDID, fileId: FILE_ID, to: 'mp4' })).not.toThrow();
    expect(() => assertPreheatRequest({ udid: UDID, fileId: FILE_ID, to: 'mp3' })).not.toThrow();
  });

  it('geçersiz payload → INVALID_BACKUP_REF', () => {
    expect(() => assertPreheatRequest(null)).toThrow(/INVALID_BACKUP_REF/);
    expect(() => assertPreheatRequest({ udid: '../x', fileId: FILE_ID, to: 'mp4' })).toThrow(
      /INVALID_BACKUP_REF/,
    );
    expect(() => assertPreheatRequest({ udid: UDID, fileId: '../../etc', to: 'mp4' })).toThrow(
      /INVALID_BACKUP_REF/,
    );
    expect(() => assertPreheatRequest({ udid: UDID, fileId: FILE_ID, to: 'exe' })).toThrow(
      /INVALID_BACKUP_REF/,
    );
    expect(() => assertPreheatRequest({ udid: UDID, fileId: FILE_ID })).toThrow(
      /INVALID_BACKUP_REF/,
    );
  });
});

describe('preheat (guard + ortak transcode yolu)', () => {
  beforeEach(() => {
    ensureTranscodedCache.mockReset();
    clearBackupRootCache();
    _resetBackupRegistry();
  });

  it('backup açılmamış → ready:false', async () => {
    const r = await preheat({ udid: UDID, fileId: FILE_ID, to: 'mp4' });
    expect(r.ready).toBe(false);
    expect(ensureTranscodedCache).not.toHaveBeenCalled();
  });

  it('hatırlanan kök izinli kökler dışında → reddedilir, transcode YOK', async () => {
    rememberBackupRoot(UDID, path.join(path.resolve('/evil/root'), UDID));
    await expect(preheat({ udid: UDID, fileId: FILE_ID, to: 'mp4' })).rejects.toThrow(
      /INVALID_BACKUP_REF/,
    );
    expect(ensureTranscodedCache).not.toHaveBeenCalled();
  });

  it('hatırlanan kök udid dizini değil → reddedilir', async () => {
    rememberBackupRoot(UDID, ROOT);
    registerBackup({ udid: UDID, rootPath: path.dirname(ROOT), isEncrypted: false });
    await expect(preheat({ udid: UDID, fileId: FILE_ID, to: 'mp4' })).rejects.toThrow(
      /INVALID_BACKUP_REF/,
    );
  });

  it('kayıtsız yedek → reddedilir', async () => {
    rememberBackupRoot(UDID, DEVICE_ROOT);
    await expect(preheat({ udid: UDID, fileId: FILE_ID, to: 'mp4' })).rejects.toThrow(
      /INVALID_BACKUP_REF/,
    );
  });

  it('şifreli yedek → BACKUP_ENCRYPTED', async () => {
    rememberBackupRoot(UDID, DEVICE_ROOT);
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: true });
    await expect(preheat({ udid: UDID, fileId: FILE_ID, to: 'mp4' })).rejects.toThrow(
      /BACKUP_ENCRYPTED/,
    );
  });

  it('geçerli → ensureTranscodedCache çağrılır, ready:true; hata → ready:false', async () => {
    rememberBackupRoot(UDID, DEVICE_ROOT);
    registerBackup({ udid: UDID, rootPath: ROOT, isEncrypted: false });
    ensureTranscodedCache.mockResolvedValueOnce('/cache/x.mp4');
    expect(await preheat({ udid: UDID, fileId: FILE_ID, to: 'mp3' })).toEqual({ ready: true });
    expect(ensureTranscodedCache.mock.calls[0]?.slice(0, 4)).toEqual([
      UDID,
      DEVICE_ROOT,
      FILE_ID,
      'mp3',
    ]);

    ensureTranscodedCache.mockRejectedValueOnce(new Error('ffmpeg transcode timeout'));
    const r = await preheat({ udid: UDID, fileId: FILE_ID, to: 'mp4' });
    expect(r.ready).toBe(false);
    expect(r.error).toMatch(/timeout/);
  });
});
