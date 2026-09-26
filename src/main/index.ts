// src/main/index.ts
import './pathOverrides'; // İLK import — bkz. dosya başlığı
import { app, BrowserWindow, ipcMain, session, Menu, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initLogger, logger } from './util/log';
import { IPC } from '@shared/ipc';
import { initThemeService, getThemeSnapshot, setThemeMode } from './themeService';
import { initUpdater } from './updater';
import { registerBackupIpc } from './ipc/backup';
import { registerPhotosIpc } from './ipc/photos';
import { registerMessagesIpc } from './ipc/messages';
import { registerWhatsAppIpc } from './ipc/whatsapp';
import { registerCallsIpc } from './ipc/calls';
import { registerVoicemailIpc } from './ipc/voicemail';
import { registerNotesIpc } from './ipc/notes';
import { registerVoiceMemosIpc } from './ipc/voicememos';
import { registerContactsIpc } from './ipc/contacts';
import { registerMediaIpc } from './ipc/media';
import { registerExportIpc } from './ipc/export';
import { registerSearchIpc } from './ipc/search';
import { registerMaintenanceIpc } from './ipc/maintenance';
import { scheduleCacheCleanup } from './cache';
import { pruneTmpSqliteCache } from './util/sqlite';
import { registerProtocolSchemes, registerBackupProtocol, clearBackupRootCache } from './protocol';
import {
  cleanupLeftoverSessionDirs,
  hasUnlockedSessions,
  lockAllEncryptedBackups,
  wipeAllSessionsSync,
} from './modules/backup/encryptedSessions';
import { DEV_CSP, PROD_CSP } from '@shared/csp';
import {
  isAllowedNavigation,
  isAllowedPermission,
  isSafeExternalUrl,
  isThemeMode,
} from './windowPolicy';
import {
  TITLE_BAR_HEIGHT,
  appMenuTemplate,
  overlayColorsFor,
  usesTitleBarOverlay,
  windowChromeOptions,
} from './windowChrome';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev'de Electron'un "Insecure CSP (unsafe-eval)" cosmetic uyarısını bastır.
// Dev CSP'de Vite HMR için unsafe-eval ZORUNLU — uyarı by design ortaya çıkıyor.
// Prod CSP'de unsafe-eval yok, packaging'de uyarı zaten çıkmaz; bu env sadece dev console temizliği.
if (process.env.VITE_DEV_SERVER_URL) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

initLogger();

registerProtocolSchemes();

let win: BrowserWindow | null = null;

function setupCsp() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  // Tek kaynak: @shared/csp. Prod build'de aynı politika index.html'e <meta> olarak da
  // enjekte edilir (vite cspMetaPlugin) — file:// yüklemede header yolu tetiklenmeyebilir.
  const csp = isDev ? DEV_CSP : PROD_CSP;

  let cspLogged = false;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!cspLogged) {
      // İlk request'te CSP injection'ın gerçekten çalıştığını kanıtla.
      // Sonraki request'ler için spam yapmamak için sadece bir kez.
      logger.info(`[csp] header injected for ${details.url} (mode=${isDev ? 'dev' : 'prod'})`);
      cspLogged = true;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

// Özel başlık çubuğu (frameless). Windows/Linux: native pencere düğmeleri overlay;
// macOS: trafik ışıkları solda (overlay yok). Kararlar windowChrome.ts'te (saf, test edilir).
// Renderer'daki TitleBar bileşeni drag bölgesini sağlar; overlay renkleri tema ile senkron
// (themeService push'unda setTitleBarOverlay). Yükseklik TitleBar CSS'i ile aynı olmalı.
export { TITLE_BAR_HEIGHT };

export function syncTitleBarOverlay(dark: boolean): void {
  if (!usesTitleBarOverlay(process.platform)) return;
  try {
    win?.setTitleBarOverlay(overlayColorsFor(dark));
  } catch {
    /* overlay desteklenmeyen platform — sessiz geç */
  }
}

const INDEX_HTML = path.join(__dirname, '../../dist/index.html');

// Pencere sertleştirme: yeni pencere / gezinme / webview yok. Harici bağlantılar
// (yalnız http/https) sistem tarayıcısında açılır; uygulama kendi sayfası dışına gidemez.
function hardenWebContents(wc: Electron.WebContents): void {
  const ctx = { devUrl: process.env.VITE_DEV_SERVER_URL ?? null, indexHtml: INDEX_HTML };

  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell
        .openExternal(url)
        .catch((e) => logger.warn(`[window] openExternal failed: ${(e as Error).message}`));
    } else {
      logger.warn(`[window] window.open reddedildi: ${url}`);
    }
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url, ctx)) return;
    event.preventDefault();
    logger.warn(`[window] navigation reddedildi: ${url}`);
  });

  wc.on('will-attach-webview', (event) => {
    event.preventDefault();
    logger.warn('[window] webview eklenmesi reddedildi');
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'AppleFileViewer',
    backgroundColor: '#0B1220', // dark default — FOUC önleme; light kullanıcı için renderer mount sonrası düzeltilir
    // Modern başlık: native frame yok. Win/Linux: pencere düğmeleri overlay;
    // macOS: trafik ışıkları TitleBar'a ortalı (windowChrome.ts).
    ...windowChromeOptions(process.platform, nativeTheme.shouldUseDarkColors),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Renderer console → main.log forwarder (headless/agent ortamında runtime kanıt için kalıcı)
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warning', 'error'] as const;
    const lvl = levels[level] ?? 'info';
    logger[lvl === 'warning' ? 'warn' : lvl](`[renderer] ${sourceId}:${line} ${message}`);
  });

  hardenWebContents(win.webContents);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win
      .loadURL(devUrl)
      .catch((e) => logger.error(`[window] loadURL failed: ${(e as Error).message}`));
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win
      .loadFile(INDEX_HTML)
      .catch((e) => logger.error(`[window] loadFile failed: ${(e as Error).message}`));
  }

  win.on('closed', () => {
    win = null;
    // Pencere kapandı → şifreli yedek oturumları kilitlenir (düz metin silinir).
    lockEncryptedSessions('window-closed');
  });
}

// ─── Şifreli yedek oturumlarının silinmesi ───────────────────────────────────
// Düz metin (afv-dec-* oturum dizinleri) pencere kapanışında, çıkışta ve (çökme sonrası)
// açılışta silinir. Ayrıntı: modules/backup/encryptedSessions.ts başlığı.

let lockAllPending: Promise<void> | null = null;

function lockEncryptedSessions(reason: string): Promise<void> {
  if (!hasUnlockedSessions()) return lockAllPending ?? Promise.resolve();
  if (!lockAllPending) {
    clearBackupRootCache();
    lockAllPending = lockAllEncryptedBackups()
      .then((errors) => {
        if (errors.length)
          logger.warn(`[crypto] ${reason}: oturum silme hataları: ${errors.join('; ')}`);
        else logger.info(`[crypto] ${reason}: şifreli yedek oturumları kilitlendi`);
      })
      .finally(() => {
        lockAllPending = null;
      });
  }
  return lockAllPending;
}

let quitWipeDone = false;
app.on('before-quit', (event) => {
  if (quitWipeDone || (!hasUnlockedSessions() && !lockAllPending)) return;
  // Async silme bitene dek çıkışı ertele (süren çözümler iptal edilir, dosyalar kapanır).
  event.preventDefault();
  void lockEncryptedSessions('before-quit').finally(() => {
    quitWipeDone = true;
    app.quit();
  });
});

app.on('will-quit', () => {
  // Son çare (before-quit atlandıysa / yeni oturum açıldıysa): senkron silme.
  if (hasUnlockedSessions()) wipeAllSessionsSync();
});

app
  .whenReady()
  .then(() => {
    // Windows/Linux: native menü çubuğu (File/Edit/View/Help) yok — uygulama kendi
    // başlık çubuğunu ve kısayollarını (keymap.ts) kullanır. macOS: minimal menü
    // (uygulama/Düzen/Pencere) — yoksa Cmd+Q/W/C/V/A/Z çalışmaz (windowChrome.ts).
    const menuTemplate = appMenuTemplate(process.platform);
    Menu.setApplicationMenu(menuTemplate ? Menu.buildFromTemplate(menuTemplate) : null);

    // İzin istekleri (kamera, mikrofon, bildirim, konum...) varsayılan RED. İstisna yalnız
    // uygulamanın kendi kullandıkları: panoya kopyalama + Lightbox tam ekran.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const ok = isAllowedPermission(permission);
      if (!ok) logger.warn(`[permission] reddedildi: ${permission}`);
      callback(ok);
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      isAllowedPermission(permission),
    );

    setupCsp(); // CSP önce kurulur — BrowserWindow oluşturulmadan önce session interceptor aktif olmalı

    ipcMain.handle(IPC.THEME_GET, () => getThemeSnapshot());
    ipcMain.handle(IPC.THEME_SET, (_e, mode: unknown) => {
      if (!isThemeMode(mode)) {
        throw new Error(`THEME_SET: geçersiz mode: ${String(mode)}`);
      }
      const snap = setThemeMode(mode);
      syncTitleBarOverlay(snap.resolved === 'dark');
      return snap;
    });
    registerBackupIpc();
    registerPhotosIpc();
    registerMessagesIpc();
    registerWhatsAppIpc();
    registerCallsIpc();
    registerVoicemailIpc();
    registerNotesIpc();
    registerVoiceMemosIpc();
    registerContactsIpc();
    registerMediaIpc();
    registerExportIpc();
    registerSearchIpc();
    registerMaintenanceIpc();
    registerBackupProtocol();

    // Startup cache temizliği — TTL (30 gün) + 5GB cap. Fire-and-forget, bloke etmez.
    scheduleCacheCleanup((msg) => logger.info(msg));

    // SQLite tmp snapshot temizliği — TTL (7 gün) + 2GB cap. Kişisel veri kopyaları
    // tmp'de süresiz kalmasın. Fire-and-forget.
    pruneTmpSqliteCache()
      .then((r) => {
        if (r.removed > 0) {
          logger.info(
            `[sqlite-tmp] prune: ${r.removed} silindi, ${r.kept} kaldı, ${(r.freedBytes / 1024 / 1024).toFixed(1)} MB boşaldı`,
          );
        }
      })
      .catch((e) => logger.warn(`[sqlite-tmp] prune failed: ${(e as Error).message}`));

    // Çökme kurtarma: ölü süreçlerden kalan afv-dec-* (çözülmüş düz metin) dizinleri.
    cleanupLeftoverSessionDirs()
      .then((n) => {
        if (n > 0) logger.info(`[crypto] açılış: ${n} yetim şifre çözüm dizini silindi`);
      })
      .catch((e) =>
        logger.warn(`[crypto] yetim dizin temizliği başarısız: ${(e as Error).message}`),
      );

    createWindow();
    initThemeService(
      () => win,
      (resolved) => syncTitleBarOverlay(resolved === 'dark'),
    );

    // Güncelleme (GitHub Releases). Kurulumdan ÖNCE şifreli oturumlar kilitlenir —
    // quitAndInstall'ın tetiklediği before-quit yine çalışır ama beklemesi gerekmez.
    initUpdater(() => win, { beforeInstall: () => lockEncryptedSessions('update-install') });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((e) => {
    // Başlatma hatası sessizce yutulmasın — log'a düş ve uygulamayı kapat.
    logger.error(`[main] whenReady başlatma hatası: ${(e as Error).stack ?? String(e)}`);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

logger.info('main bootstrap complete');
