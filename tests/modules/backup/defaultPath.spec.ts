// defaultPath — platforma göre varsayılan yedek kökleri (platform/home/env enjekte edilir;
// process.platform'a dayanmaz → her OS'ta aynı sonuç).
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\Users\\u\\AppData\\Roaming' } }));

import { resolveDefaultBackupRoots } from '@main/modules/backup/defaultPath';

describe('resolveDefaultBackupRoots', () => {
  it('Windows: klasik iTunes (%APPDATA%) + Microsoft Store/Apple Devices (%USERPROFILE%\\Apple)', () => {
    const roots = resolveDefaultBackupRoots({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\u' },
      homeDir: 'C:\\Users\\u',
    });
    expect(roots).toEqual([
      {
        path: 'C:\\Users\\u\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup',
        source: 'itunes',
      },
      { path: 'C:\\Users\\u\\Apple\\MobileSync\\Backup', source: 'appleDevices' },
    ]);
  });

  it("Windows: Electron appData yolu %APPDATA%'ya tercih edilir; env yoksa home türetilir", () => {
    const roots = resolveDefaultBackupRoots({
      platform: 'win32',
      env: {},
      homeDir: 'D:\\Profiles\\x',
      appDataDir: 'E:\\Roam',
    });
    expect(roots.map((r) => r.path)).toEqual([
      'E:\\Roam\\Apple Computer\\MobileSync\\Backup',
      'D:\\Profiles\\x\\Apple\\MobileSync\\Backup',
    ]);
    const noAppData = resolveDefaultBackupRoots({ platform: 'win32', env: {}, homeDir: 'D:\\p' });
    expect(noAppData[0]!.path).toBe('D:\\p\\AppData\\Roaming\\Apple Computer\\MobileSync\\Backup');
  });

  it('macOS: ~/Library/Application Support/MobileSync/Backup (finder)', () => {
    expect(resolveDefaultBackupRoots({ platform: 'darwin', env: {}, homeDir: '/Users/u' })).toEqual(
      [{ path: '/Users/u/Library/Application Support/MobileSync/Backup', source: 'finder' }],
    );
  });

  it('Linux: varsayılan kök yok (libimobiledevice sabit klasör kullanmaz)', () => {
    expect(resolveDefaultBackupRoots({ platform: 'linux', env: {}, homeDir: '/home/u' })).toEqual(
      [],
    );
  });

  it('AFV_BACKUP_DIR (mutlak) her platformda tek kök olur', () => {
    expect(
      resolveDefaultBackupRoots({
        platform: 'linux',
        env: { AFV_BACKUP_DIR: '/srv/backups' },
        homeDir: '/home/u',
      }),
    ).toEqual([{ path: '/srv/backups', source: 'env' }]);
    expect(
      resolveDefaultBackupRoots({
        platform: 'win32',
        env: { AFV_BACKUP_DIR: 'F:\\bk', APPDATA: 'C:\\a' },
        homeDir: 'C:\\u',
      }),
    ).toEqual([{ path: 'F:\\bk', source: 'env' }]);
  });

  it('AFV_BACKUP_DIR göreli ise yok sayılır', () => {
    const roots = resolveDefaultBackupRoots({
      platform: 'darwin',
      env: { AFV_BACKUP_DIR: 'relative/dir' },
      homeDir: '/Users/u',
    });
    expect(roots[0]!.source).toBe('finder');
  });
});
