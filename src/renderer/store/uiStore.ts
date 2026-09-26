import { create } from 'zustand';
import type { ThemeMode, ResolvedTheme } from '@shared/ipc';
import { detectLocale, setActiveLocale, type Locale } from '../i18n';

interface ActiveBackup {
  udid: string;
  rootPath: string;
  /** Manifest'ten okunan cihaz adı — TitleBar'da gösterilir (yoksa udid kısaltması). */
  deviceName: string | null;
  /** Şifreli (ve bu oturumda kilidi açık) yedek — Sidebar "Kilitle" eylemi için. */
  encrypted?: boolean;
}

interface UIState {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  sidebarCollapsed: boolean;
  activeBackup: ActiveBackup | null;
  /** Komut paleti (Ctrl+K) — global state: TitleBar butonu + keymap AYNI paleti açar. */
  paletteOpen: boolean;
  /** Aktif dil — değişim setActiveLocale ile sözlüğü değiştirir, App.tsx
   *  `key={locale}` remount'u ile tüm görünür metinler yenilenir. */
  locale: Locale;
  setTheme: (mode: ThemeMode, resolved: ResolvedTheme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setActiveBackup: (b: ActiveBackup | null) => void;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  setLocale: (l: Locale) => void;
}

export const useUIStore = create<UIState>((set) => ({
  themeMode: 'system',
  resolvedTheme: 'light',
  sidebarCollapsed: false,
  activeBackup: null,
  paletteOpen: false,
  locale: detectLocale(),
  setTheme: (mode, resolved) => set({ themeMode: mode, resolvedTheme: resolved }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setActiveBackup: (b) => set({ activeBackup: b }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setLocale: (l) => {
    setActiveLocale(l);
    set({ locale: l });
  },
}));
