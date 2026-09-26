// src/main/themeService.ts
import { nativeTheme, type BrowserWindow } from 'electron';
import { store } from './store';
import { IPC, type ThemeMode, type ResolvedTheme, type ThemePushPayload } from '@shared/ipc';
import { logger } from './util/log';
import { isThemeMode } from './windowPolicy';

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return mode;
}

function readMode(): ThemeMode {
  const raw = store.get('ui.theme') as unknown;
  return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function initThemeService(
  getWindow: () => BrowserWindow | null,
  onResolved?: (resolved: ResolvedTheme) => void,
): void {
  const push = () => {
    const mode = readMode();
    const resolved = resolve(mode);
    const payload: ThemePushPayload = { mode, resolved };
    getWindow()?.webContents.send(IPC.THEME_PUSH, payload);
    onResolved?.(resolved); // başlık çubuğu overlay rengi tema ile senkron
    logger.info(`theme push ${JSON.stringify(payload)}`);
  };

  nativeTheme.on('updated', () => {
    const mode = readMode();
    if (mode === 'system') push();
  });

  setImmediate(push);
}

export function getThemeSnapshot(): ThemePushPayload {
  const mode = readMode();
  return { mode, resolved: resolve(mode) };
}

export function setThemeMode(mode: ThemeMode): ThemePushPayload {
  // Savunma derinliği: IPC handler'ı da doğrular; store'a yalnız geçerli değer yazılır.
  if (!isThemeMode(mode)) {
    throw new Error(`setThemeMode: geçersiz mode: ${String(mode)}`);
  }
  store.set('ui.theme', mode);
  return getThemeSnapshot();
}
