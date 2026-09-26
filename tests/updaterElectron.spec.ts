// updater.ts — electron-updater yapılandırması (mock) + IPC girdi doğrulaması.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => '0.1.0' },
  ipcMain: {
    handle: (ch: string, fn: (...args: unknown[]) => unknown) => handlers.set(ch, fn),
  },
  net: { fetch: vi.fn() },
  shell: { openExternal: vi.fn(async () => undefined) },
}));

const fakeAutoUpdater = {
  logger: null as unknown,
  autoDownload: true,
  autoInstallOnAppQuit: true,
  allowPrerelease: true,
  allowDowngrade: true,
  verifyUpdateCodeSignature: undefined as unknown,
};
// Gerçek paket CJS: ESM import'ta hem default hem named yüzey olabilir.
vi.mock('electron-updater', () => ({
  autoUpdater: fakeAutoUpdater,
  default: { autoUpdater: fakeAutoUpdater },
}));

vi.mock('@main/store', () => {
  const data = new Map<string, unknown>([
    ['update.autoCheck', true],
    ['update.lastCheckAt', null],
  ]);
  return {
    store: { get: (k: string) => data.get(k), set: (k: string, v: unknown) => data.set(k, v) },
  };
});
vi.mock('@main/util/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { IPC } from '@shared/ipc';
import { initUpdater, loadElectronUpdater } from '@main/updater';

beforeEach(() => {
  Object.assign(fakeAutoUpdater, {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    verifyUpdateCodeSignature: undefined,
  });
});

describe('loadElectronUpdater', () => {
  it('win-nsis: otomatik indirme/kurulum kapalı, imzasız yayıncı doğrulaması atlanır', async () => {
    const engine = await loadElectronUpdater('win-nsis');
    expect(engine).toBe(fakeAutoUpdater);
    expect(fakeAutoUpdater.autoDownload).toBe(false);
    expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(fakeAutoUpdater.allowPrerelease).toBe(false);
    const verify = fakeAutoUpdater.verifyUpdateCodeSignature as (
      p: string[],
      f: string,
    ) => Promise<string | null>;
    await expect(verify(['x'], 'C:\\tmp\\setup.exe')).resolves.toBeNull();
  });

  it('linux-appimage: imza doğrulaması ayarına dokunulmaz', async () => {
    await loadElectronUpdater('linux-appimage');
    expect(fakeAutoUpdater.verifyUpdateCodeSignature).toBeUndefined();
    expect(fakeAutoUpdater.autoDownload).toBe(false);
  });
});

describe('initUpdater IPC', () => {
  it('dev modda devre dışı; geçersiz girdiler reddedilir', async () => {
    const svc = initUpdater(() => null, { beforeInstall: async () => undefined });
    expect(svc.mode).toBe('disabled');
    const get = handlers.get(IPC.UPDATE_GET)!;
    expect(get({})).toMatchObject({ kind: 'dev', mode: 'disabled', currentVersion: '0.1.0' });

    const setAuto = handlers.get(IPC.UPDATE_SET_AUTO_CHECK)!;
    expect(() => setAuto({}, 'yes')).toThrow();
    expect(setAuto({}, false)).toMatchObject({ autoCheck: false });

    const open = handlers.get(IPC.UPDATE_OPEN_EXTERNAL)!;
    expect(() => open({}, 'https://evil.example')).toThrow();
    // repository define'ı test ortamında yok → güvenli URL yok → false
    await expect(open({}, 'releases')).resolves.toBe(false);
    svc.dispose();
  });
});
