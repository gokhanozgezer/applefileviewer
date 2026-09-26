import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { L } from '../../i18n';

interface RouteErrorProps {
  title: string;
  error: unknown;
  onRetry: () => void;
  /** Dar liste panelleri (320px) için küçük ikon — h-7. Varsayılan h-10. */
  compact?: boolean;
  /** Modül vurgu rengi — WhatsApp 'wa' kullanır. */
  accent?: 'default' | 'wa';
}

/**
 * Route hata bloğu — AlertTriangle + yeniden dene + katlanabilir mono hata detayı.
 * Tüm modüllerin (messages/whatsapp/calls/voicemail/notes/voicememos/contacts/photos)
 * ortak loading/error kalıbının tek kaynağı.
 */
export function RouteError({
  title,
  error,
  onRetry,
  compact = false,
  accent = 'default',
}: RouteErrorProps) {
  const [showDetail, setShowDetail] = useState(false);

  const retryClass =
    accent === 'wa'
      ? 'cursor-pointer rounded-md bg-wa-accent/10 px-3 py-1.5 text-sm font-medium text-wa-accent transition-colors duration-fast hover:bg-wa-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wa-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
      : 'cursor-pointer rounded-md bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-fast hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <AlertTriangle
        className={compact ? 'h-7 w-7 text-warning' : 'h-10 w-10 text-warning'}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="text-sm text-text">{title}</p>
      <button type="button" onClick={onRetry} className={retryClass}>
        {L.common.retry}
      </button>
      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
        className="cursor-pointer text-xs text-text-muted hover:text-text"
      >
        {L.common.showDetail}
      </button>
      {showDetail && (
        <pre className="max-w-full overflow-auto rounded bg-surface-2 p-2 text-left font-mono text-[11px] text-text-subtle">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
    </div>
  );
}
