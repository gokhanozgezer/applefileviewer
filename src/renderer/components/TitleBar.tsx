// src/renderer/components/TitleBar.tsx
// Özel başlık çubuğu — main tarafında titleBarStyle: 'hidden' (src/main/windowChrome.ts).
// Windows/Linux: titleBarOverlay → native min/max/kapat SAĞDA overlay (yükseklik 40px),
// sağda boşluk bırakılır. macOS: trafik ışıkları SOLDA → solda boşluk bırakılır
// (html[data-platform="darwin"], globals.css .titlebar). Bu bar sürükleme bölgesidir
// (.app-drag); interaktif tüm çocuklar .app-no-drag alır. Çift tıkla büyüt/geri al
// native davranıştır.
import { useNavigate } from 'react-router-dom';
import { Smartphone, Search, Settings } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { L } from '../i18n';
import { formatShortcut, shortcutById } from '../keymap';

function withShortcut(label: string, id: string): string {
  const keys = shortcutById(id)?.keys;
  return keys ? `${label} (${formatShortcut(keys)})` : label;
}

export function TitleBar() {
  const navigate = useNavigate();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);

  return (
    <header className="titlebar app-drag flex h-10 w-full shrink-0 select-none items-center gap-2 border-b border-border bg-surface">
      {/* App mark + wordmark (marka — çevrilmez) */}
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent">
        <Smartphone className="h-3.5 w-3.5 text-surface" strokeWidth={1.5} />
      </div>
      <span className="min-w-0 truncate text-sm font-semibold text-text">
        AppleFileViewer
        {activeBackup && (
          <span className="font-normal text-text-muted">
            {' — '}
            {activeBackup.deviceName ?? activeBackup.udid.slice(0, 8)}
          </span>
        )}
      </span>

      <div className="flex-1" />

      <div className="app-no-drag flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label={L.titleBar.searchAria}
          title={withShortcut(L.titleBar.searchAria, 'open-palette')}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label={L.titleBar.settingsAria}
          title={withShortcut(L.titleBar.settingsAria, 'open-settings')}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text"
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Windows/Linux: native pencere kontrolleri (titleBarOverlay) bu alana çizilir — boş
          bırak. macOS'ta (düğmeler solda) yalnız küçük kenar boşluğu (globals.css). */}
      <div className="titlebar-controls-spacer" aria-hidden="true" />
    </header>
  );
}
