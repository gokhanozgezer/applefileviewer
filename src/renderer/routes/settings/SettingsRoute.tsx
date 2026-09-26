// src/renderer/routes/settings/SettingsRoute.tsx
// Ayarlar sayfası (MASTER.md §9 — Ctrl+,). Yedek açık olmadan da çalışır:
// top-level /settings route'u, :udid parametresine bağımlı değildir.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sun, Moon, MonitorCog, Trash2, Info, Database, Palette, Languages } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useUIStore } from '../../store/uiStore';
import { L, type Locale } from '../../i18n';
import { notify } from '../../components/ui/toast';
import { APP_AUTHOR, APP_VERSION } from '../../lib/appInfo';
import { ArrowUpCircle } from 'lucide-react';
import { UpdateSection } from '../../components/UpdateSection';
import { formatBytes, formatCount } from '../../lib/format';
import type { ThemeMode, CacheStats, CacheClearResult } from '@shared/ipc';

// Label render sırasında L.theme[mode] ile çözülür — module-scope'ta metin
// yakalanmaz, dil değişiminde güncel sözlükten okunur.
const THEME_MODES: readonly { mode: ThemeMode; icon: typeof Sun }[] = [
  { mode: 'system', icon: MonitorCog },
  { mode: 'light', icon: Sun },
  { mode: 'dark', icon: Moon },
];

// Dil adları özel isim gibi davranır — her iki dilde de kendi adıyla gösterilir,
// i18n'e girmez.
const LOCALES: readonly { locale: Locale; label: string }[] = [
  { locale: 'tr', label: 'Türkçe' },
  { locale: 'en', label: 'English' },
];

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sun;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-md)]">
      <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function CacheRow({ label, stats }: { label: string; stats?: { bytes: number; files: number } }) {
  return (
    <>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm tabular-nums text-text">
        {stats
          ? `${formatBytes(stats.bytes)} · ${formatCount(stats.files)} ${L.settings.filesSuffix}`
          : '—'}
      </dd>
    </>
  );
}

export function SettingsRoute() {
  const { themeMode, setMode } = useTheme();
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);
  const queryClient = useQueryClient();

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch,
  } = useQuery<CacheStats>({
    queryKey: ['maintenance', 'cacheStats'],
    queryFn: () => window.api.maintenance.cacheStats(),
  });

  const clearMutation = useMutation<CacheClearResult>({
    mutationFn: () => window.api.maintenance.cacheClear(),
    onSuccess: async (res) => {
      notify.success(
        `${formatCount(res.removedFiles)} ${L.settings.filesSuffix}, ${formatBytes(res.freedBytes)} ${L.settings.clearedSuffix}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['maintenance', 'cacheStats'] });
    },
    onError: () => {
      notify.error(L.settings.clearError);
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-8 py-10">
      <h1 className="text-2xl font-semibold leading-tight text-text">{L.settings.title}</h1>

      <div className="space-y-4">
        {/* 1) Görünüm */}
        <SectionCard icon={Palette} title={L.settings.appearance}>
          <div
            role="group"
            aria-label={L.settings.appearance}
            className="inline-flex rounded-lg border border-border bg-surface-2 p-1"
          >
            {THEME_MODES.map(({ mode, icon: Icon }) => {
              const label = L.theme[mode];
              const active = themeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => void setMode(mode)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? 'bg-surface text-text shadow-[var(--shadow-sm)]'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : ''}`}
                    strokeWidth={1.5}
                  />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-text-muted">{L.settings.appearanceHint}</p>
        </SectionCard>

        {/* 2) Dil / Language */}
        <SectionCard icon={Languages} title={L.settings.language}>
          <div
            role="group"
            aria-label={L.settings.language}
            className="inline-flex rounded-lg border border-border bg-surface-2 p-1"
          >
            {LOCALES.map(({ locale: loc, label }) => {
              const active = locale === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLocale(loc)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? 'bg-surface text-text shadow-[var(--shadow-sm)]'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-text-muted">{L.settings.languageHint}</p>
        </SectionCard>

        {/* 3) Önbellek */}
        <SectionCard icon={Database} title={L.settings.cache}>
          {statsLoading ? (
            <div role="status" aria-busy="true" className="space-y-2">
              <span className="sr-only">{L.common.loading}</span>
              <div className="h-4 w-56 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
            </div>
          ) : statsError ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-muted">{L.settings.statsError}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="cursor-pointer rounded-md bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-fast hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {L.common.retry}
              </button>
            </div>
          ) : (
            <dl className="grid grid-cols-[220px_1fr] gap-y-2">
              <CacheRow
                label={L.settings.mediaCache}
                stats={
                  stats ? { bytes: stats.mediaCacheBytes, files: stats.mediaCacheFiles } : undefined
                }
              />
              <CacheRow
                label={L.settings.sqliteTmp}
                stats={
                  stats ? { bytes: stats.sqliteTmpBytes, files: stats.sqliteTmpFiles } : undefined
                }
              />
            </dl>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
              className="flex cursor-pointer items-center gap-2 rounded-md bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition-colors duration-fast hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {clearMutation.isPending ? L.settings.clearing : L.settings.clearCache}
            </button>
          </div>
          <p className="mt-3 text-xs text-text-muted">{L.settings.cacheHint}</p>
        </SectionCard>

        {/* Güncellemeler (GitHub Releases) */}
        <SectionCard icon={ArrowUpCircle} title={L.update.section}>
          <UpdateSection />
        </SectionCard>

        {/* 4) Hakkında */}
        <SectionCard icon={Info} title={L.settings.about}>
          <p className="text-sm font-medium text-text">{L.app.title}</p>
          <p className="mt-1 text-sm text-text-muted">{L.settings.aboutDescription}</p>
          <p className="mt-3 text-xs text-text-subtle">
            {L.settings.version}{' '}
            <span className="font-mono tabular-nums text-text-muted">{APP_VERSION}</span>
          </p>
          {APP_AUTHOR && (
            <p className="mt-1 text-xs text-text-subtle">
              {L.settings.author} <span className="font-mono text-text-muted">{APP_AUTHOR}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-text-subtle">
            {L.settings.license} <span className="font-mono text-text-muted">MIT</span>
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
