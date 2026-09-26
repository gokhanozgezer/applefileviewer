import { useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import {
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Image,
  MessageSquare,
  MessageCircle,
  Phone,
  Voicemail,
  StickyNote,
  Mic,
  Users,
  LayoutGrid,
  ChevronDown,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { useUIStore } from '../store/uiStore';
import { RouteError } from '../components/state/RouteError';
import { copyToClipboard } from '../components/ui/toast';
import { L } from '../i18n';
import { collator, dateLocale } from '../i18n/dateLocale';
import { formatBytes, formatCount } from '../lib/format';
import type { BackupDetails } from '../../shared/domain';

// Sidebar ile TUTARLI: modül kartları ilgili route'a navigate eder
// (path → /backup/:udid/<path>). Label render sırasında L.sidebar[labelKey].
const QUICK_ACTIONS = [
  { key: 'photos', icon: Image, labelKey: 'photos', path: 'photos' },
  { key: 'messages', icon: MessageSquare, labelKey: 'messages', path: 'messages' },
  { key: 'whatsapp', icon: MessageCircle, labelKey: 'whatsapp', path: 'whatsapp' },
  { key: 'calls', icon: Phone, labelKey: 'calls', path: 'calls' },
  { key: 'voicemail', icon: Voicemail, labelKey: 'voicemail', path: 'voicemail' },
  { key: 'notes', icon: StickyNote, labelKey: 'notes', path: 'notes' },
  { key: 'voicememos', icon: Mic, labelKey: 'voicememos', path: 'voicememos' },
  { key: 'contacts', icon: Users, labelKey: 'contacts', path: 'contacts' },
] as const;

const CARD = 'rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-md)]';
const CARD_TITLE = 'mb-4 text-xs font-semibold uppercase tracking-wider text-text-muted';
const ICON_BTN =
  'shrink-0 cursor-pointer rounded p-0.5 text-text-muted transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/** Uygulama listesi satır yüksekliği (py-1.5 + text-xs mono ≈ 28px). */
const APP_ROW = 28;
/** Açık listenin azami yüksekliği — kart sayfayı domine etmesin. */
const APP_LIST_MAX = 320;

function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-32 animate-pulse rounded-xl border border-border bg-surface ${className}`}
    />
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-text">{children}</dd>
    </>
  );
}

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => void copyToClipboard(value)}
      title={L.overview.copy}
      aria-label={L.overview.copy}
      className={ICON_BTN}
    >
      <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
    </button>
  );
}

function AppRow({ index, style, data }: ListChildComponentProps<string[]>) {
  const app = data[index]!;
  return (
    <li
      style={style}
      title={app}
      className="flex items-center truncate rounded px-2 font-mono text-xs text-text hover:bg-surface-2"
    >
      <span className="truncate">{app}</span>
    </li>
  );
}

/**
 * Yüklü uygulamalar — sayı kartı; "Listeyi göster" ile aranabilir, sanal
 * (react-window) listeye genişler. Yüzlerce bundle id'de bile DOM küçük kalır.
 */
function InstalledAppsCard({ apps }: { apps: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const listId = useId();

  const sorted = useMemo(
    () => [...apps].sort((a, b) => a.localeCompare(b, collator(), { sensitivity: 'base' })),
    [apps],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((a) => a.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  const listHeight = Math.min(APP_LIST_MAX, filtered.length * APP_ROW);

  return (
    <div className={`${CARD} sm:col-span-2`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <LayoutGrid className="h-5 w-5 shrink-0 text-text-muted" strokeWidth={1.5} />
          <div className="min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {L.overview.installedApps}
            </h2>
            <p className="text-sm tabular-nums text-text">
              {formatCount(apps.length)} {L.overview.appsCountSuffix}
            </p>
          </div>
        </div>
        {apps.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={listId}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-fast hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {expanded ? L.overview.hideApps : L.overview.showApps}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-fast ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {apps.length === 0 && <p className="mt-3 text-xs text-text-muted">{L.overview.appsEmpty}</p>}

      {expanded && (
        <div id={listId} className="mt-4 space-y-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={L.overview.appsSearchPlaceholder}
              aria-label={L.overview.appsSearchAria}
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-7 pr-2 text-sm text-text outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-text-muted">{L.overview.appsNoMatch}</p>
          ) : (
            <FixedSizeList<string[]>
              height={listHeight}
              width="100%"
              itemCount={filtered.length}
              itemSize={APP_ROW}
              itemData={filtered}
              innerElementType="ul"
              overscanCount={8}
            >
              {AppRow}
            </FixedSizeList>
          )}
        </div>
      )}
    </div>
  );
}

export function BackupOverview() {
  const { udid } = useParams<{ udid: string }>();
  const navigate = useNavigate();
  const activeBackup = useUIStore((s) => s.activeBackup);

  const { data, isLoading, isError, error, refetch } = useQuery<BackupDetails>({
    queryKey: ['backup', 'details', udid],
    queryFn: () => window.api.backup.open({ udid: udid!, rootPath: activeBackup!.rootPath }),
    enabled: !!udid && !!activeBackup,
  });

  const formattedDate = data?.lastBackupDate
    ? format(new Date(data.lastBackupDate), 'd MMMM yyyy HH:mm', { locale: dateLocale() })
    : '—';

  // B9: backup.open başarısız olduğunda '—' placeholder yerine gerçek hata + retry.
  if (isError) {
    return (
      <div className="h-full">
        <RouteError title={L.overview.errorTitle} error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-8 py-10" aria-busy={isLoading || undefined}>
      {/* A) Hero */}
      <div className="flex items-center gap-5">
        <Smartphone className="h-12 w-12 shrink-0 text-text-muted" strokeWidth={1.5} />
        <div className="min-w-0">
          {isLoading ? (
            <div role="status" className="h-7 w-48 animate-pulse rounded bg-surface-2">
              <span className="sr-only">{L.common.loading}</span>
            </div>
          ) : (
            <>
              <h1
                className="truncate text-2xl font-semibold leading-tight text-text"
                title={data?.deviceName ?? udid}
              >
                {data?.deviceName ?? udid ?? '—'}
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                {[
                  data?.productName,
                  data?.productVersion ? `iOS ${data.productVersion}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </>
          )}
        </div>
        {!isLoading &&
          data &&
          (data.isEncrypted ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {L.overview.encrypted}
            </span>
          ) : (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              {L.overview.unencrypted}
            </span>
          ))}
      </div>

      {/* B) Bento kartları */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton className="sm:col-span-2" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Kart: Cihaz */}
          <div className={CARD}>
            <h2 className={CARD_TITLE}>{L.overview.device}</h2>
            <dl className="grid grid-cols-[100px_1fr] gap-y-2">
              <InfoRow label={L.overview.model}>{data?.productName ?? '—'}</InfoRow>
              <InfoRow label={L.overview.type}>{data?.productType ?? '—'}</InfoRow>
              <InfoRow label={L.overview.ios}>{data?.productVersion ?? '—'}</InfoRow>
              <InfoRow label={L.overview.build}>
                <span className="font-mono text-xs">{data?.buildVersion ?? '—'}</span>
              </InfoRow>
              <InfoRow label={L.overview.serial}>
                {data?.serialNumber ? (
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs" title={data.serialNumber}>
                      {data.serialNumber}
                    </span>
                    <CopyButton value={data.serialNumber} />
                  </span>
                ) : (
                  '—'
                )}
              </InfoRow>
              {data?.imei && (
                <InfoRow label={L.overview.imei}>
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs tabular-nums">{data.imei}</span>
                    <CopyButton value={data.imei} />
                  </span>
                </InfoRow>
              )}
              {data?.phoneNumber && (
                <InfoRow label={L.overview.phoneNumber}>
                  <span className="flex items-center gap-2">
                    <span className="truncate tabular-nums">{data.phoneNumber}</span>
                    <CopyButton value={data.phoneNumber} />
                  </span>
                </InfoRow>
              )}
            </dl>
          </div>

          {/* Kart: Yedek */}
          <div className={CARD}>
            <h2 className={CARD_TITLE}>{L.overview.backup}</h2>
            <dl className="grid grid-cols-[100px_1fr] gap-y-2">
              <InfoRow label={L.overview.lastBackup}>
                <span className="tabular-nums">{formattedDate}</span>
              </InfoRow>
              <InfoRow label={L.overview.encryption}>
                {data?.isEncrypted ? L.overview.encrypted : L.overview.unencrypted}
              </InfoRow>
              {data?.totalSizeBytes != null && (
                <InfoRow label={L.overview.size}>
                  <span className="tabular-nums">{formatBytes(data.totalSizeBytes)}</span>
                </InfoRow>
              )}
            </dl>
          </div>

          {/* Kart: Kimlik (full-width) */}
          <div className={`${CARD} sm:col-span-2`}>
            <h2 className={CARD_TITLE}>{L.overview.identity}</h2>
            <dl className="space-y-3">
              <div>
                <dt className="mb-1 text-xs text-text-muted">{L.overview.udid}</dt>
                <dd className="flex items-center gap-2">
                  <span className="break-all font-mono text-xs text-text">{data?.udid ?? '—'}</span>
                  {data?.udid && <CopyButton value={data.udid} />}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-text-muted">{L.overview.backupPath}</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="min-w-0 truncate font-mono text-xs text-text-subtle"
                    title={data?.rootPath}
                  >
                    {data?.rootPath ?? '—'}
                  </span>
                  {data?.rootPath && <CopyButton value={data.rootPath} />}
                </dd>
              </div>
            </dl>
          </div>

          {/* Kart: Yüklü uygulamalar (full-width, genişletilebilir) */}
          {data && <InstalledAppsCard apps={data.installedApps ?? []} />}
        </div>
      )}

      {/* C) Quick Actions */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-text-muted">{L.overview.modules}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map(({ key, icon: Icon, labelKey, path }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/backup/${udid}/${path}`)}
              className="group relative cursor-pointer rounded-xl border border-border bg-surface p-4 text-left outline-none transition-colors duration-fast hover:border-accent/40 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <Icon
                className="mb-2 h-6 w-6 text-text-muted transition-colors duration-fast group-hover:text-accent"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-text">{L.sidebar[labelKey]}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
