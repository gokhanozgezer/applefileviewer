// ipc/backup — backup:unlock / backup:lock + guard'ın kilitli/kilidi açık davranışı.
// Gerçek şifreli fixture (küçük PBKDF2 turu), gerçek registry + guard + oturum modülü.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES_ROOT, getTmpRoot } from '../setup';
import {
  writeEncryptedSessionFixture,
  ENC_PASSWORD,
  type EncryptedFixture,
} from '../modules/backup/encryptedSessionFixture';

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>;
const handlers = new Map<string, Handler>();
const storeState: Record<string, unknown> = {};
let defaultRoot = '';
const clearBackupRootCache = vi.fn();

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
  forgetBackupRootsUnder: vi.fn(),
  rememberBackupRoot: vi.fn(),
  clearBackupRootCache: (...a: unknown[]) => clearBackupRootCache(...a),
}));
const logged: string[] = [];
vi.mock('@main/util/log', () => {
  const rec = (...a: unknown[]) => logged.push(a.map(String).join(' '));
  return { logger: { info: rec, warn: rec, error: rec, debug: rec } };
});

const { registerBackupIpc } = await import('@main/ipc/backup');
const { IPC, ipcErrorCode } = await import('@shared/ipc');
const safeFs = await import('@main/safeFs');
const { _resetBackupRegistry, registerBackup } =
  await import('@main/modules/backup/backupRegistry');
const { guardBackupRef } = await import('@main/ipc/guard');
const { sessionDirOf, _resetEncryptedSessionsForTest } =
  await import('@main/modules/backup/encryptedSessions');

const PLAIN_UDID = 'abcdef0123456789abcdef0123456789abcdef01';
let fx: EncryptedFixture;

function call(ch: string, payload?: unknown): Promise<unknown> {
  const h = handlers.get(ch);
  if (!h) throw new Error(`handler yok: ${ch}`);
  return Promise.resolve().then(() => h({}, payload));
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return ipcErrorCode(e);
  }
}

describe('backup:unlock / backup:lock', () => {
  beforeEach(async () => {
    handlers.clear();
    logged.length = 0;
    for (const k of Object.keys(storeState)) delete storeState[k];
    storeState['ui.backupRootOverride'] = null;
    fx = writeEncryptedSessionFixture(getTmpRoot());
    defaultRoot = fx.rootPath;
    fs.cpSync(path.join(FIXTURES_ROOT, 'backups'), defaultRoot, { recursive: true });
    _resetBackupRegistry();
    safeFs._resetProtectedRootsForTest();
    clearBackupRootCache.mockClear();
    registerBackupIpc();
    await call(IPC.BACKUP_LIST); // registry'yi tarama ile doldur
  });

  afterEach(() => {
    _resetEncryptedSessionsForTest();
  });

  const ref = () => ({ udid: fx.udid, rootPath: fx.rootPath });

  it('tarama: şifreli yedek kilitli işaretlenir; kilitliyken BACKUP_OPEN + guard reddeder', async () => {
    const list = (await call(IPC.BACKUP_LIST)) as {
      backups: Array<{ udid: string; isEncrypted: boolean; unlocked?: boolean }>;
    };
    const enc = list.backups.find((b) => b.udid === fx.udid)!;
    expect(enc).toMatchObject({ isEncrypted: true, unlocked: false });
    expect(await codeOf(call(IPC.BACKUP_OPEN, ref()))).toBe('BACKUP_ENCRYPTED');
    expect(() => guardBackupRef(ref())).toThrow(/BACKUP_ENCRYPTED/);
  });

  it('yanlış parola → wrongPassword (throw değil), yedek kilitli kalır; parola loglanmaz', async () => {
    const res = await call(IPC.BACKUP_UNLOCK, { ...ref(), password: 'yanlis-parola-xyz' });
    expect(res).toEqual({ status: 'wrongPassword' });
    expect(() => guardBackupRef(ref())).toThrow(/BACKUP_ENCRYPTED/);
    expect(logged.join('\n')).not.toContain('yanlis-parola-xyz');
  });

  it('doğru parola → ok; guard + BACKUP_OPEN geçer, liste unlocked=true; kilitle → tekrar reddedilir + dizin silinir', async () => {
    expect(await call(IPC.BACKUP_UNLOCK, { ...ref(), password: ENC_PASSWORD })).toEqual({
      status: 'ok',
    });
    expect(logged.join('\n')).not.toContain(ENC_PASSWORD);
    expect(() => guardBackupRef(ref())).not.toThrow();
    const details = (await call(IPC.BACKUP_OPEN, ref())) as {
      isEncrypted: boolean;
      unlocked?: boolean;
    };
    expect(details).toMatchObject({ isEncrypted: true, unlocked: true });
    const list = (await call(IPC.BACKUP_LIST)) as {
      backups: Array<{ udid: string; unlocked?: boolean }>;
    };
    expect(list.backups.find((b) => b.udid === fx.udid)!.unlocked).toBe(true);

    const dir = sessionDirOf(fx.udid)!;
    expect(fs.existsSync(dir)).toBe(true);
    expect(await call(IPC.BACKUP_LOCK, { udid: fx.udid })).toEqual({ locked: true });
    expect(clearBackupRootCache).toHaveBeenCalledWith(fx.udid);
    expect(fs.existsSync(dir)).toBe(false);
    expect(() => guardBackupRef(ref())).toThrow(/BACKUP_ENCRYPTED/);
    expect(await codeOf(call(IPC.BACKUP_OPEN, ref()))).toBe('BACKUP_ENCRYPTED');
    expect(await call(IPC.BACKUP_LOCK, { udid: fx.udid })).toEqual({ locked: false });
  });

  it('taranmamış / izinsiz kök → INVALID_BACKUP_REF (PBKDF2 hiç çalışmaz)', async () => {
    _resetBackupRegistry();
    expect(await codeOf(call(IPC.BACKUP_UNLOCK, { ...ref(), password: ENC_PASSWORD }))).toBe(
      'INVALID_BACKUP_REF',
    );
    expect(
      await codeOf(
        call(IPC.BACKUP_UNLOCK, { udid: fx.udid, rootPath: getTmpRoot(), password: 'x' }),
      ),
    ).toBe('INVALID_BACKUP_REF');
  });

  it('şifrelemesi bilinmeyen yedek → reddedilir (fail closed)', async () => {
    registerBackup({ ...ref(), isEncrypted: false, encryptionUnknown: true });
    expect(await codeOf(call(IPC.BACKUP_UNLOCK, { ...ref(), password: ENC_PASSWORD }))).toBe(
      'INVALID_BACKUP_REF',
    );
  });

  it('şifresiz yedek → error sonucu', async () => {
    const res = await call(IPC.BACKUP_UNLOCK, {
      udid: PLAIN_UDID,
      rootPath: fx.rootPath,
      password: 'x',
    });
    expect(res).toMatchObject({ status: 'error' });
  });

  it.each([
    ['boş', ''],
    ['string değil', 42],
    ['çok uzun', 'a'.repeat(1025)],
  ])('geçersiz parola (%s) → INVALID_BACKUP_REF', async (_n, password) => {
    expect(await codeOf(call(IPC.BACKUP_UNLOCK, { ...ref(), password }))).toBe(
      'INVALID_BACKUP_REF',
    );
  });

  it('backup:lock geçersiz udid → INVALID_BACKUP_REF', async () => {
    expect(await codeOf(call(IPC.BACKUP_LOCK, { udid: '../x' }))).toBe('INVALID_BACKUP_REF');
    expect(await codeOf(call(IPC.BACKUP_LOCK, null))).toBe('INVALID_BACKUP_REF');
  });
});
