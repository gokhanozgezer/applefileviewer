// src/renderer/components/UpdateBanner.tsx
// Sessiz (açılış) kontrolde yeni sürüm bulununca köşede küçük, kapatılabilir bildirim.
// "Görüntüle" → Ayarlar (Güncellemeler bölümü). Elle yapılan kontrolde çıkmaz (kullanıcı
// zaten Ayarlar'da); /settings'teyken de gizlenir. Kapatma sürüm başına, oturum boyu.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpCircle, X } from 'lucide-react';
import { useUpdater } from '../hooks/useUpdater';
import { L } from '../i18n';

// Modül düzeyi — dil değişiminde RootLayout remount olsa da kapatma korunur.
const dismissedVersions = new Set<string>();

/** Test yardımcısı — modül durumunu sıfırlar. */
export function __resetUpdateBannerForTests(): void {
  dismissedVersions.clear();
}

export function UpdateBanner() {
  const { snapshot } = useUpdater();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [, force] = useState(0);

  const state = snapshot?.state;
  if (!state || state.status !== 'available' || state.origin !== 'silent') return null;
  if (dismissedVersions.has(state.version) || pathname.startsWith('/settings')) return null;

  const dismiss = () => {
    dismissedVersions.add(state.version);
    force((n) => n + 1);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-banner"
      className="fixed bottom-4 left-4 z-40 flex max-w-sm items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text shadow-[var(--shadow-md)]"
    >
      <ArrowUpCircle className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1">
        {L.update.availablePrefix} <span className="font-mono tabular-nums">{state.version}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          dismiss();
          navigate('/settings');
        }}
        className="cursor-pointer rounded-md bg-accent/10 px-2.5 py-1 text-sm font-medium text-accent transition-colors duration-fast hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {L.update.view}
      </button>
      <button
        type="button"
        aria-label={L.update.dismissAria}
        onClick={dismiss}
        className="cursor-pointer rounded-md p-1 text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
