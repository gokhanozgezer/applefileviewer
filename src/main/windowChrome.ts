// windowChrome — platforma göre pencere çerçevesi + native menü kararlarının saf
// (Electron çalışma zamanı gerektirmeyen) yüzü. index.ts buradan okur; birim testle doğrulanır.
//
//  - Windows/Linux: titleBarStyle 'hidden' + titleBarOverlay (min/max/kapat sağda overlay)
//  - macOS: titleBarStyle 'hidden' + trafficLightPosition (trafik ışıkları solda, TitleBar
//    yüksekliğine ortalı); titleBarOverlay YOK (macOS'ta anlamsız). Renderer sol tarafta
//    trafik ışıkları için boşluk bırakır (html[data-platform="darwin"]).
//  - Menü: Windows/Linux'ta native menü yok (uygulama kendi başlık çubuğu + keymap.ts);
//    macOS'ta minimal menü ŞART — yoksa Cmd+Q/W/C/V/A/Z ve uygulama menüsü çalışmaz.

/** TitleBar CSS yüksekliği (h-10) ile aynı olmalı. */
export const TITLE_BAR_HEIGHT = 40;

/** macOS trafik ışığı düğmesi çapı (~12px) — dikey ortalama için. */
const TRAFFIC_LIGHT_SIZE = 12;

export interface OverlayColors {
  color: string;
  symbolColor: string;
  height: number;
}

export function overlayColorsFor(dark: boolean): OverlayColors {
  // globals.css token değerleri (--surface / --text-muted karşılıkları)
  return dark
    ? { color: '#0f172a', symbolColor: '#94a3b8', height: TITLE_BAR_HEIGHT }
    : { color: '#ffffff', symbolColor: '#475569', height: TITLE_BAR_HEIGHT };
}

/** titleBarOverlay destekleyen (ve kullanan) platform mu. */
export function usesTitleBarOverlay(platform: NodeJS.Platform): boolean {
  return platform !== 'darwin';
}

export interface WindowChromeOptions {
  titleBarStyle: 'hidden';
  titleBarOverlay?: OverlayColors;
  trafficLightPosition?: { x: number; y: number };
}

export function windowChromeOptions(platform: NodeJS.Platform, dark: boolean): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: {
        x: 14,
        y: Math.round((TITLE_BAR_HEIGHT - TRAFFIC_LIGHT_SIZE) / 2),
      },
    };
  }
  return { titleBarStyle: 'hidden', titleBarOverlay: overlayColorsFor(dark) };
}

/** Menü şablonu öğesi — Electron.MenuItemConstructorOptions'ın kullandığımız alt kümesi. */
export interface MenuRoleItem {
  role: 'appMenu' | 'editMenu' | 'windowMenu';
}

/**
 * Native uygulama menüsü şablonu; null → menü yok (Menu.setApplicationMenu(null)).
 * macOS: appMenu (Hakkında/Gizle/Çık — Cmd+Q), editMenu (Geri al/Kes/Kopyala/Yapıştır/Tümünü
 * seç — Cmd+Z/X/C/V/A), windowMenu (Küçült/Kapat — Cmd+M/W).
 */
export function appMenuTemplate(platform: NodeJS.Platform): MenuRoleItem[] | null {
  if (platform !== 'darwin') return null;
  return [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }];
}
