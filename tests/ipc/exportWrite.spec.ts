// export IPC — kullanıcının seçtiği hedef bir yedek klasörü içindeyse yazım
// REDDEDİLMELİ (safeFs.writeFileOut korunan-kök kontrolü). Eskiden handleSave /
// handleNotesFolder cache.writeExportFile ile ham fs yazıyordu → yedeğe dosya düşüyordu.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { getTmpRoot } from '../setup';

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>;
const handlers = new Map<string, Handler>();
const storeState: Record<string, unknown> = { 'ui.backupRootOverride': null };
let defaultRoot = '';
const showSaveDialog = vi.fn();
const showOpenDialog = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) },
  dialog: { showSaveDialog, showOpenDialog },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  shell: { showItemInFolder: vi.fn() },
  session: { fromPartition: vi.fn() },
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
vi.mock('@main/modules/notes/listNotes', () => ({
  listNotes: async () => [
    { id: 1, title: 'Alışveriş', snippet: '', body: 'süt', folder: '', modifiedIso: null },
  ],
}));
vi.mock('@main/util/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { registerExportIpc } = await import('@main/ipc/export');
const { IPC } = await import('@shared/ipc');
const safeFs = await import('@main/safeFs');
const { registerBackup, _resetBackupRegistry } =
  await import('@main/modules/backup/backupRegistry');

const UDID = 'abcdef0123456789abcdef0123456789abcdef01';

function call(ch: string, payload?: unknown): Promise<unknown> {
  const h = handlers.get(ch);
  if (!h) throw new Error(`handler yok: ${ch}`);
  return Promise.resolve().then(() => h({}, payload));
}

describe('export IPC — yedek klasörüne yazma reddi', () => {
  let backupDir: string;

  beforeEach(() => {
    handlers.clear();
    showSaveDialog.mockReset();
    showOpenDialog.mockReset();
    defaultRoot = path.join(getTmpRoot(), 'Backup');
    backupDir = path.join(defaultRoot, UDID);
    fs.mkdirSync(backupDir, { recursive: true });
    safeFs._resetProtectedRootsForTest();
    safeFs.protectBackupRoots([defaultRoot]);
    _resetBackupRegistry();
    registerBackup({ udid: UDID, rootPath: defaultRoot, isEncrypted: false });
    registerExportIpc();
  });

  it('EXPORT_SAVE: yedek içi hedef reddedilir, dosya yazılmaz', async () => {
    const dest = path.join(backupDir, 'kisiler.json');
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: dest });
    const r = (await call(IPC.EXPORT_SAVE, {
      kind: 'contacts',
      format: 'json',
      suggestedName: 'kisiler',
      payload: [],
    })) as { saved: boolean; error?: string };
    expect(r.saved).toBe(false);
    expect(r.error).toMatch(/Backup write forbidden/);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('EXPORT_SAVE: yedek dışı hedefe yazar', async () => {
    const dest = path.join(getTmpRoot(), 'out', 'kisiler.json');
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: dest });
    const r = (await call(IPC.EXPORT_SAVE, {
      kind: 'contacts',
      format: 'json',
      suggestedName: 'kisiler',
      payload: [],
    })) as { saved: boolean };
    expect(r.saved).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('[]');
  });

  it('EXPORT_NOTES_FOLDER: yedek içi klasör seçilirse not yazılmaz', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [backupDir] });
    const before = fs.readdirSync(backupDir);
    const r = (await call(IPC.EXPORT_NOTES_FOLDER, { udid: UDID, rootPath: defaultRoot })) as {
      copied: number;
      failed: number;
      errors: string[];
    };
    expect(r.copied).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.errors[0]).toMatch(/Backup write forbidden/);
    expect(fs.readdirSync(backupDir)).toEqual(before);
  });
});
