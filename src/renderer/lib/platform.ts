// src/renderer/lib/platform.ts
// Renderer'ın platform bilgisi — tek kaynak preload'un `window.api.platform` sabiti.
// Preload yoksa (vitest/jsdom, düz tarayıcı) navigator'dan tahmin edilir.
//
// Kullanım: kısayol modifier'ı (Ctrl ↔ ⌘), başlık çubuğu yerleşimi (trafik ışıkları),
// platforma özgü metinler ("Explorer'da göster" / "Finder'da göster" / "Klasörde göster").

export type UiPlatform = 'win32' | 'darwin' | 'linux';

/** Node platform dizesini UI'nın ayırt ettiği üç aileye indirger (bsd'ler → linux). */
export function toUiPlatform(p: string | undefined | null): UiPlatform {
  if (p === 'darwin') return 'darwin';
  if (p === 'win32') return 'win32';
  return 'linux';
}

function guessFromNavigator(): UiPlatform {
  if (typeof navigator === 'undefined') return 'win32';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`;
  if (/mac/i.test(hint)) return 'darwin';
  if (/linux|x11|cros/i.test(hint)) return 'linux';
  // Bilinmiyorsa Windows varsayılır (uygulamanın tarihsel varsayılanı; testler buna dayanır).
  return 'win32';
}

export function getPlatform(): UiPlatform {
  const fromPreload =
    typeof window !== 'undefined'
      ? (window as { api?: { platform?: string } }).api?.platform
      : undefined;
  return fromPreload ? toUiPlatform(fromPreload) : guessFromNavigator();
}

export function isMac(platform: UiPlatform = getPlatform()): boolean {
  return platform === 'darwin';
}

/** <html data-platform="..."> — CSS platforma göre (ör. trafik ışığı boşluğu) ayarlanır. */
export function applyPlatformAttribute(
  root: HTMLElement = document.documentElement,
  platform: UiPlatform = getPlatform(),
): void {
  root.dataset.platform = platform;
}

/** Platforma göre metin/değer seçimi (ör. "Explorer" / "Finder" / "klasör"). */
export function pickByPlatform<T>(
  choices: { win32: T; darwin: T; linux: T },
  platform: UiPlatform = getPlatform(),
): T {
  return choices[platform];
}
