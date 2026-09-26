import { Smartphone, ChevronRight, Lock, LockOpen } from 'lucide-react';
import { format } from 'date-fns';
import { L } from '../i18n';
import { dateLocale } from '../i18n/dateLocale';
import type { BackupSummary } from '@shared/domain';
import { cn } from '../lib/utils';
import { formatBytes } from '../lib/format';

interface Props {
  backup: BackupSummary;
  highlighted?: boolean;
  onClick: () => void;
  isOpening?: boolean;
}

export function BackupCard({ backup, highlighted, onClick, isOpening }: Props) {
  // Tarih: Info.plist Last Backup Date (ISO). Boyut + foto sayısı Info.plist'te YOK
  // (Manifest.db/klasör taraması gerekir) — bu dispatch'te gösterilmez, Phase 5+'ta gelir.
  const date = backup.lastBackupDate
    ? format(new Date(backup.lastBackupDate), 'd MMMM yyyy HH:mm', { locale: dateLocale() })
    : '—';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOpening}
      aria-busy={isOpening || undefined}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left transition-colors duration-fast hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        highlighted && 'border-l-4 border-l-accent pl-3',
        isOpening && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2">
        <Smartphone className="h-6 w-6 text-text-muted" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-base font-medium text-text"
            title={backup.deviceName ?? backup.udid}
          >
            {backup.deviceName ?? backup.udid.slice(0, 8)}
          </span>
          {/* Şifreli yedek: kilitli / kilidi açık rozeti (oturum durumu main'den — unlocked) */}
          {backup.isEncrypted &&
            (backup.unlocked ? (
              <span
                title={L.unlock.unlockedHint}
                data-testid="backup-lock-badge"
                data-locked="false"
                className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success ring-1 ring-success/30"
              >
                <LockOpen className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                {L.unlock.unlockedBadge}
              </span>
            ) : (
              <span
                title={L.unlock.lockedHint}
                data-testid="backup-lock-badge"
                data-locked="true"
                className="inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger ring-1 ring-danger/30"
              >
                <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                {L.unlock.lockedBadge}
              </span>
            ))}
          {backup.parseError && !backup.isEncrypted && (
            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning ring-1 ring-warning/30">
              {L.backupList.readErrorBadge}
            </span>
          )}
        </div>
        <div className="text-sm text-text-muted">
          {[
            backup.productName,
            backup.productVersion ? `iOS ${backup.productVersion}` : null,
            backup.totalSizeBytes != null ? formatBytes(backup.totalSizeBytes) : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </div>
        <div className="text-xs text-text-subtle tabular-nums">
          {L.backupList.lastBackupPrefix} {date}
        </div>
        <div
          className="mt-1 truncate font-mono text-[11px] text-text-subtle"
          title={backup.rootPath}
        >
          {backup.udid} ·{' '}
          <span data-testid="backup-source" data-source={backup.source}>
            {L.backupList.sources[backup.source]}
          </span>
        </div>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-text-subtle transition-colors group-hover:text-accent"
        strokeWidth={1.5}
      />
    </button>
  );
}
