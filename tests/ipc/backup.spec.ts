// ipc/backup — handler'lar ipcMain.handle mock'u ile yakalanıp doğrudan çağrılır.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { FIXTURES_ROOT, getTmpRoot } from '../setup';

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>;
const handlers = new Map<string, Handler>();
const storeState: Record<string, unknown> = {};
let defaultRoot = '';
const forgetBackupRootsUnder = vi.fn();
const rememberBackupRoot = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) },
  dialog: { showOpenDialog: vi.fn() },
}));
vi.mock('@main/store', () => ({
  store: {
    get: (k: string) => storeState[k],
    set: (k: string, v: unknown) => {
      storeState[k] = v;
    },
  },
}));
vi.mock('@main/modules/backup/defaultPath', () => ({
  getDefaultBackupRoots: () => [{ path: defaultRoot, source: 'itunes' }],
  getDefaultBackupPaths: () => [defaultRoot],
}));
vi.mock('@main/protocol', () => ({
  forgetBackupRootsUnder,
  rememberBackupRoot,
  clearBackupRootCache: vi.fn(),
}));
vi.mock('@main/util/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { registerBackupIpc } = await import('@main/ipc/backup');
const { IPC, ipcErrorCode } = await import('@shared/ipc');
const safeFs = await import('@main/safeFs');
const { _resetBackupRegistry } = await import('@main/modules/backup/backupRegistry');

const UDID = 'abcdef0123456789abcdef0123456789abcdef01';

function call(ch: string, payload?: unknown): Promise<unknown> {
  const h = handlers.get(ch);
  if (!h) throw new Error(`handler yok: ${ch}`);
  // ipcMain.handle senkron throw'u da reject'e çevirir — aynısını taklit et
  return Promise.resolve().then(() => h({}, payload));
}

function copyFixture(dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(FIXTURES_ROOT, 'backups'), dest, { recursive: true });
}

function markEncrypted(root: string, udid: string): void {
  fs.writeFileSync(
    path.join(root, udid, 'Manifest.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>IsEncrypted</key><true/></dict></plist>`,
  );
}

describe('ipc/backup', () => {
  beforeEach(() => {
    handlers.clear();
    for (const k of Object.keys(storeState)) delete storeState[k];
    storeState['ui.backupRootOverride'] = null;
    defaultRoot = path.join(getTmpRoot(), 'default');
    copyFixture(defaultRoot);
    _resetBackupRegistry();
    safeFs._resetProtectedRootsForTest();
    forgetBackupRootsUnder.mockClear();
    rememberBackupRoot.mockClear();
    registerBackupIpc();
  });

  it('BACKUP_OPEN override kökü için source=override döndürür + Info.plist detayları', async () => {
    const override = path.join(getTmpRoot(), 'override');
    copyFixture(override);
    storeState['ui.backupRootOverride'] = override;
    await call(IPC.BACKUP_LIST);
    const d = (await call(IPC.BACKUP_OPEN, { udid: UDID, rootPath: override })) as {
      source: string;
      serialNumber: string | null;
      buildVersion: string | null;
    };
    expect(d.source).toBe('override');
    expect(d.serialNumber).toBe('F2LXR0XXXX');
    expect(d.buildVersion).toBe('22C161');
    expect(rememberBackupRoot).toHaveBeenCalledWith(UDID, path.join(override, UDID));
  });

  it('BACKUP_OPEN varsayılan kök için kökün türü (itunes)', async () => {
    const d = (await call(IPC.BACKUP_OPEN, { udid: UDID, rootPath: defaultRoot })) as {
      source: string;
    };
    expect(d.source).toBe('itunes');
  });

  it('BACKUP_OPEN şifreli yedeği BACKUP_ENCRYPTED ile reddeder, kök açılmaz', async () => {
    markEncrypted(defaultRoot, UDID);
    const err = await call(IPC.BACKUP_OPEN, { udid: UDID, rootPath: defaultRoot }).catch((e) => e);
    expect(ipcErrorCode(err)).toBe('BACKUP_ENCRYPTED');
    expect(rememberBackupRoot).not.toHaveBeenCalled();
  });

  it('BACKUP_OPEN izinli olmayan kök / bozuk udid reddedilir', async () => {
    const err1 = await call(IPC.BACKUP_OPEN, { udid: UDID, rootPath: getTmpRoot() }).catch(
      (e) => e,
    );
    expect(ipcErrorCode(err1)).toBe('INVALID_BACKUP_REF');
    const err2 = await call(IPC.BACKUP_OPEN, { udid: '../..', rootPath: defaultRoot }).catch(
      (e) => e,
    );
    expect(ipcErrorCode(err2)).toBe('INVALID_BACKUP_REF');
  });

  it('BACKUP_LIST taranan yedekleri ve üst kökleri yazmaya kapatır', async () => {
    await call(IPC.BACKUP_LIST);
    const src = path.join(defaultRoot, UDID, 'Info.plist');
    await expect(
      safeFs.copyFileOut(src, path.join(defaultRoot, 'export.txt')),
    ).rejects.toBeInstanceOf(safeFs.BackupWriteForbiddenError);
    await expect(
      safeFs.copyFileOut(src, path.join(getTmpRoot(), 'out', 'export.txt')),
    ).resolves.toBeUndefined();
  });

  it('BACKUP_RESCAN taze tarama yapar (diskte yeni şifrelenen yedek yansır)', async () => {
    const first = (await call(IPC.BACKUP_LIST)) as { backups: { isEncrypted: boolean }[] };
    expect(first.backups[0]!.isEncrypted).toBe(false);
    markEncrypted(defaultRoot, UDID);
    const second = (await call(IPC.BACKUP_RESCAN)) as { backups: { isEncrypted: boolean }[] };
    expect(second.backups[0]!.isEncrypted).toBe(true);
    const { guardBackupRef } = await import('@main/ipc/guard');
    expect(() => guardBackupRef({ udid: UDID, rootPath: defaultRoot })).toThrow(/BACKUP_ENCRYPTED/);
  });

  it("BACKUP_CLEAR_OVERRIDE override'ı siler, yalnız eski override altındaki kökleri unutur", async () => {
    storeState['ui.backupRootOverride'] = 'D:\\x';
    await expect(call(IPC.BACKUP_CLEAR_OVERRIDE)).resolves.toEqual({ ok: true });
    expect(storeState['ui.backupRootOverride']).toBeNull();
    // Tümünü temizleme YOK — eski override + korunacak default kök ile çağrılır
    expect(forgetBackupRootsUnder).toHaveBeenCalledOnce();
    expect(forgetBackupRootsUnder).toHaveBeenCalledWith('D:\\x', [defaultRoot]);
  });

  it('BACKUP_CLEAR_OVERRIDE override yoksa hiçbir kökü unutmaz', async () => {
    await call(IPC.BACKUP_CLEAR_OVERRIDE);
    expect(forgetBackupRootsUnder).not.toHaveBeenCalled();
  });

  it('BACKUP_OPEN Manifest.plist okunamazsa (şifreleme bilinmiyor) reddeder — fail closed', async () => {
    fs.rmSync(path.join(defaultRoot, UDID, 'Manifest.plist'));
    await call(IPC.BACKUP_LIST);
    await expect(call(IPC.BACKUP_OPEN, { udid: UDID, rootPath: defaultRoot })).rejects.toThrow(
      /şifreleme durumu bilinmiyor/,
    );
    expect(rememberBackupRoot).not.toHaveBeenCalled();
    const { guardBackupRef } = await import('@main/ipc/guard');
    expect(() => guardBackupRef({ udid: UDID, rootPath: defaultRoot })).toThrow(
      /INVALID_BACKUP_REF/,
    );
  });
});
