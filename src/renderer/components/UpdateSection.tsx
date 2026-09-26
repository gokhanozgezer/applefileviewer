// src/renderer/components/UpdateSection.tsx
// Ayarlar > Güncellemeler içeriği. Düğmeler platform yeteneğine (snapshot.mode) ve
// duruma göre değişir: 'auto' → İndir ve kur / Yeniden başlat; 'notify' → GitHub'dan indir;
// 'disabled' (dev) → yalnız bilgi + releases sayfası. Sürüm notları DÜZ METİN render
// edilir (main HTML'i ayıklar) — dangerouslySetInnerHTML yok.
import { Download, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import type { UpdateSnapshot } from '@shared/ipc';
import { useUpdater } from '../hooks/useUpdater';
import { L } from '../i18n';
import { collator } from '../i18n/dateLocale';
import { formatBytes } from '../lib/format';
import { APP_VERSION } from '../lib/appInfo';

const BTN_PRIMARY =
  'flex cursor-pointer items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60';
const BTN_SECONDARY =
  'flex cursor-pointer items-center gap-2 rounded-md bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-fast hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60';

function formatDate(iso: string | null | number): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(collator(), { year: 'numeric', month: 'long', day: 'numeric' });
}

function statusText(snap: UpdateSnapshot): string | null {
  const s = snap.state;
  switch (s.status) {
    case 'checking':
      return L.update.checking;
    case 'not-available':
      return L.update.upToDate;
    case 'available':
      return `${L.update.availablePrefix} ${s.version}`;
    case 'downloading':
      return `${L.update.downloading} ${Math.round(s.percent)}%`;
    case 'downloaded':
      return `${L.update.downloadedPrefix} ${s.version} — ${L.update.readyToRestart}`;
    case 'error':
      return `${L.update.errorPrefix} ${s.message}`;
    default:
      return null;
  }
}

function modeHint(snap: UpdateSnapshot): string | null {
  if (snap.mode === 'disabled') return L.update.devOnly;
  if (snap.kind === 'mac') return L.update.macHint;
  if (snap.mode === 'notify') return L.update.notifyHint;
  return null;
}

export function UpdateSection() {
  const { snapshot, check, download, install, setAutoCheck, openExternal } = useUpdater();

  if (!snapshot) {
    return (
      <p className="text-xs text-text-subtle">
        {L.update.currentVersion}{' '}
        <span className="font-mono tabular-nums text-text-muted">{APP_VERSION}</span>
      </p>
    );
  }

  const { state, mode } = snapshot;
  const disabled = mode === 'disabled';
  const busy = state.status === 'checking' || state.status === 'downloading';
  const notes = state.status === 'available' || state.status === 'downloaded' ? state.notes : null;
  const released =
    state.status === 'available' || state.status === 'downloaded' ? formatDate(state.date) : null;
  const status = statusText(snapshot);
  const hint = modeHint(snapshot);
  const lastCheck = formatDate(snapshot.lastCheckAt);

  return (
    <div className="space-y-4" data-testid="update-section">
      <dl className="grid grid-cols-[220px_1fr] gap-y-2">
        <dt className="text-sm text-text-muted">{L.update.currentVersion}</dt>
        <dd className="font-mono text-sm tabular-nums text-text">{snapshot.currentVersion}</dd>
        {lastCheck && !disabled && (
          <>
            <dt className="text-sm text-text-muted">{L.update.lastCheck}</dt>
            <dd className="text-sm text-text">{lastCheck}</dd>
          </>
        )}
      </dl>

      {hint && <p className="text-xs text-text-muted">{hint}</p>}

      {status && (
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${state.status === 'error' ? 'text-danger' : 'text-text'}`}
        >
          {status}
        </p>
      )}

      {state.status === 'downloading' && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-label={L.update.progressAria}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.percent)}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-fast"
              style={{ width: `${Math.max(0, Math.min(100, state.percent))}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-text-muted">
            {state.total > 0
              ? `${formatBytes(state.transferred)} / ${formatBytes(state.total)} · `
              : ''}
            {formatBytes(state.bytesPerSecond)}
            {L.update.perSecondSuffix}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {state.status === 'available' && mode === 'auto' && (
          <button type="button" className={BTN_PRIMARY} onClick={() => void download()}>
            <Download className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {L.update.downloadAndInstall}
          </button>
        )}
        {state.status === 'available' && mode === 'notify' && (
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => void openExternal('download')}
          >
            <Download className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {L.update.downloadFromGitHub}
          </button>
        )}
        {state.status === 'downloaded' && mode === 'auto' && (
          <button type="button" className={BTN_PRIMARY} onClick={() => void install()}>
            <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {L.update.restartAndUpdate}
          </button>
        )}
        {state.status !== 'downloaded' && (
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={disabled || busy}
            onClick={() => void check()}
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${state.status === 'checking' ? 'animate-spin' : ''}`}
              strokeWidth={1.5}
            />
            {state.status === 'checking' ? L.update.checking : L.update.check}
          </button>
        )}
        {snapshot.releasesUrl && (
          <button
            type="button"
            onClick={() => void openExternal('releases')}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            {L.update.openReleases}
          </button>
        )}
      </div>

      {notes && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-text-muted">
            {L.update.releaseNotes}
            {released ? ` · ${released}` : ''}
          </h3>
          <pre
            data-testid="update-notes"
            className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-3 font-sans text-xs text-text"
          >
            {notes}
          </pre>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          aria-checked={snapshot.autoCheck}
          checked={snapshot.autoCheck}
          disabled={disabled}
          onChange={(e) => void setAutoCheck(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
        />
        <span>
          <span className="block text-sm text-text">{L.update.autoCheck}</span>
          <span className="block text-xs text-text-muted">{L.update.autoCheckHint}</span>
        </span>
      </label>
    </div>
  );
}
