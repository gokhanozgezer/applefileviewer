// updater — updaterCore'u Electron'a bağlar: electron-updater (tembel yükleme), GitHub
// REST (notify modu), electron-store ayarları, IPC handler'ları ve renderer push'u.
// Karar mantığı ve durum makinesi updaterCore.ts'tedir (birim testli).

import { app, ipcMain, net, shell, type BrowserWindow } from 'electron';
import type { AppUpdater, NsisUpdater } from 'electron-updater';
import { IPC, type UpdateOpenTarget } from '@shared/ipc';
import { store } from './store';
import { logger } from './util/log';
import {
  UpdaterService,
  detectUpdateKind,
  parseGitHubRelease,
  parseGitHubRepo,
  type GitHubRelease,
  type RepoRef,
  type UpdaterEngine,
} from './updaterCore';
import type { UpdateKind } from '@shared/ipc';

const FETCH_TIMEOUT_MS = 15_000;

/**
 * electron-updater'ı yükleyip yapılandırır. Yalnız 'auto' modda (NSIS / AppImage) çağrılır —
 * macOS'ta MacUpdater (Squirrel.Mac) hiç oluşturulmaz.
 */
export async function loadElectronUpdater(kind: UpdateKind): Promise<UpdaterEngine> {
  // CJS paket — ESM'den import edildiğinde named export'lar default altında olabilir.
  const ns = await import('electron-updater');
  const autoUpdater: AppUpdater | undefined =
    (ns as unknown as { default?: { autoUpdater?: AppUpdater } }).default?.autoUpdater ??
    ns.autoUpdater;
  if (!autoUpdater) throw new Error('electron-updater yüklenemedi');

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = false; // kullanıcı karar verir
  autoUpdater.autoInstallOnAppQuit = false; // kurulum yalnız açık kullanıcı eylemiyle
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  if (kind === 'win-nsis') {
    // İmzasız yayın: yayıncı (Authenticode) doğrulaması yapılamaz. electron-updater 6.x
    // app-update.yml'de publisherName yoksa zaten atlar; burada açıkça devre dışı
    // (null = geçerli). Bütünlük latest.yml'deki sha512 (HTTPS GitHub) ile korunur.
    (autoUpdater as NsisUpdater).verifyUpdateCodeSignature = () => Promise.resolve(null);
  }
  return autoUpdater as unknown as UpdaterEngine;
}

/** releases/latest — 404 (hiç yayın yok) → null. */
export async function fetchLatestGitHubRelease(repo: RepoRef): Promise<GitHubRelease | null> {
  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/releases/latest`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await net.fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AppleFileViewer/${app.getVersion()}`,
      },
      signal: ctrl.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const release = parseGitHubRelease(await res.json());
    if (!release) throw new Error('GitHub API: beklenmeyen yanıt');
    return release;
  } finally {
    clearTimeout(timer);
  }
}

function buildRepoRef(): RepoRef | null {
  const raw = typeof __APP_REPOSITORY__ === 'string' ? __APP_REPOSITORY__ : '';
  return parseGitHubRepo(raw);
}

function isOpenTarget(v: unknown): v is UpdateOpenTarget {
  return v === 'releases' || v === 'download';
}

let service: UpdaterService | null = null;

export function initUpdater(
  getWindow: () => BrowserWindow | null,
  opts: { beforeInstall: () => Promise<void> },
): UpdaterService {
  const kind = detectUpdateKind({
    isPackaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
  });

  service = new UpdaterService({
    kind,
    arch: process.arch,
    currentVersion: app.getVersion(),
    repo: buildRepoRef(),
    loadEngine: () => loadElectronUpdater(kind),
    fetchLatestRelease: fetchLatestGitHubRelease,
    settings: {
      getAutoCheck: () => store.get('update.autoCheck') !== false,
      setAutoCheck: (v) => store.set('update.autoCheck', v),
      getLastCheckAt: () => {
        const v = store.get('update.lastCheckAt') as unknown;
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      },
      setLastCheckAt: (v) => store.set('update.lastCheckAt', v),
    },
    openExternal: (url) => shell.openExternal(url),
    beforeInstall: opts.beforeInstall,
    push: (snap) => {
      const wc = getWindow()?.webContents;
      if (wc && !wc.isDestroyed()) wc.send(IPC.UPDATE_PUSH, snap);
    },
    log: logger,
    now: () => Date.now(),
  });
  const svc = service;
  logger.info(`[updater] tür=${kind} mod=${svc.mode}`);

  ipcMain.handle(IPC.UPDATE_GET, () => svc.getSnapshot());
  ipcMain.handle(IPC.UPDATE_CHECK, () => svc.check('manual'));
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, () => svc.download());
  ipcMain.handle(IPC.UPDATE_INSTALL, () => svc.install());
  ipcMain.handle(IPC.UPDATE_SET_AUTO_CHECK, (_e, value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('UPDATE_SET_AUTO_CHECK: boolean bekleniyor');
    return svc.setAutoCheck(value);
  });
  ipcMain.handle(IPC.UPDATE_OPEN_EXTERNAL, (_e, target: unknown) => {
    if (!isOpenTarget(target)) throw new Error(`UPDATE_OPEN_EXTERNAL: geçersiz hedef`);
    return svc.openExternal(target);
  });

  svc.scheduleSilentChecks();
  return svc;
}

export function getUpdaterService(): UpdaterService | null {
  return service;
}
