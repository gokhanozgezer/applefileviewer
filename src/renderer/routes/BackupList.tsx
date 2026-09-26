import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { BackupRootInfo, BackupSummary } from '@shared/domain';
import {
  RefreshCw,
  FolderPlus,
  FolderSearch,
  Sun,
  Moon,
  MonitorCog,
  ShieldAlert,
} from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { useTheme } from '../hooks/useTheme';
import { Button } from '../components/ui/button';
import {
  useBackupList,
  useRescanBackups,
  usePickBackupFolder,
  useOpenBackup,
} from '../hooks/useBackups';
import { BackupCard } from '../components/BackupCard';
import { EncryptedDialog, type UnlockTarget } from '../components/EncryptedDialog';
import { RouteError } from '../components/state/RouteError';
import { notify } from '../components/ui/toast';
import { L } from '../i18n';
import { getPlatform, pickByPlatform } from '../lib/platform';

/** Linux boş durumunda gösterilen örnek libimobiledevice komutu (çevrilmez — komut). */
const LINUX_BACKUP_COMMAND = 'idevicebackup2 backup --full ~/iPhoneBackup';

/**
 * macOS: yedek kökü TCC korumalı ve izin yok → açıklama + Sistem Ayarları (Tam Disk
 * Erişimi) düğmesi + klasör seçme alternatifi.
 */
function FullDiskAccessNotice({ onPick }: { onPick: () => void }) {
  const openSettings = async () => {
    try {
      const r = await window.api.backup.openFullDiskAccessSettings();
      if (!r.opened) notify.error(L.backupList.fdaOpenFailed);
    } catch {
      notify.error(L.backupList.fdaOpenFailed);
    }
  };
  return (
    <div
      role="alert"
      data-testid="fda-notice"
      className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-left"
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={1.5} />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text">{L.backupList.fdaTitle}</h2>
        <p className="mt-1 text-sm text-text-muted">{L.backupList.fdaBody}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void openSettings()} className="cursor-pointer">
            {L.backupList.fdaOpenSettings}
          </Button>
          <Button size="sm" variant="outline" onClick={onPick} className="cursor-pointer">
            {L.backupList.pickFolderBtn}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Boş durumda hangi klasörlerin tarandığı ve durumları (yok / izin yok ...). */
function ScannedRoots({ roots }: { roots: readonly BackupRootInfo[] }) {
  if (roots.length === 0) return null;
  return (
    <div className="mt-6 w-full max-w-xl text-left">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {L.backupList.scannedRootsTitle}
      </h3>
      <ul className="mt-2 space-y-1">
        {roots.map((r) => (
          <li
            key={`${r.source}|${r.path}`}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="min-w-0 truncate font-mono text-text-muted" title={r.path}>
              {r.path}
            </span>
            <span className="shrink-0 text-text-subtle">
              {L.backupList.sources[r.source]} · {L.backupList.rootStates[r.state]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BackupList() {
  const { data, isLoading, isError, error, refetch } = useBackupList();
  const rescan = useRescanBackups();
  const pickFolder = usePickBackupFolder();
  const open = useOpenBackup();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [unlockTarget, setUnlockTarget] = useState<UnlockTarget | null>(null);
  const [openingUdid, setOpeningUdid] = useState<string | null>(null);
  const { themeMode, resolvedTheme, cycle } = useTheme();
  const ThemeIcon = themeMode === 'system' ? MonitorCog : themeMode === 'light' ? Sun : Moon;

  const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const onPick = async () => {
    try {
      const res = await pickFolder.mutateAsync();
      if (!res.canceled && !res.valid) {
        notify.error(
          res.permissionDenied ? L.backupList.permissionDeniedToast : L.backupList.notValidToast,
        );
      }
    } catch (err) {
      notify.error(`${L.backupList.scanError}: ${errText(err)}`);
    }
  };

  const openBackup = async (udid: string, rootPath: string) => {
    setOpeningUdid(udid);
    try {
      await open.mutateAsync({ udid, rootPath });
      navigate(`/backup/${udid}`);
    } catch (err) {
      // Önceden reddedilen promise yutuluyordu — kullanıcı tıklamanın neden
      // sonuçsuz kaldığını göremiyordu.
      notify.error(`${L.errors.backupOpenError} ${errText(err)}`);
    } finally {
      setOpeningUdid(null);
    }
  };

  const onSelect = (b: BackupSummary) => {
    // Kilitli şifreli yedek → önce parola; kilidi açıksa normal açılış.
    if (b.isEncrypted && !b.unlocked) {
      setUnlockTarget({ udid: b.udid, rootPath: b.rootPath, deviceName: b.deviceName });
      return;
    }
    void openBackup(b.udid, b.rootPath);
  };

  const onUnlocked = async (b: UnlockTarget) => {
    setUnlockTarget(null);
    // Rozet "kilidi açık"a dönsün (liste main'in oturum kaydından gelir).
    void qc.invalidateQueries({ queryKey: ['backup', 'list'] });
    await openBackup(b.udid, b.rootPath);
  };

  return (
    // h-full + overflow-y-auto (min-h-screen DEĞİL) — üstte 40px TitleBar var (RootLayout).
    <div className="h-full overflow-y-auto bg-bg text-text">
      <div className="relative mx-auto max-w-3xl px-6 pb-8 pt-12">
        <button
          type="button"
          onClick={cycle}
          aria-label={`${L.theme.cycleAria}: ${L.theme[themeMode]} (${resolvedTheme})`}
          title={`${L.theme.cycleAria}: ${L.theme[themeMode]}`}
          className="absolute right-6 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ThemeIcon className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-text">{L.app.title}</h1>
          <p className="mt-1 text-sm text-text-muted">{L.backupList.subtitle}</p>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <span className="text-sm text-text-muted tabular-nums">
            {data ? `${data.backups.length} ${L.backupList.countSuffix}` : ''}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => rescan.mutate()}
              disabled={rescan.isPending}
              aria-label={L.backupList.rescanAria}
              title={L.backupList.rescanAria}
              className="cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${rescan.isPending ? 'animate-spin' : ''}`}
                strokeWidth={1.5}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPick}
              aria-label={L.backupList.pickFolderAria}
              title={L.backupList.pickFolderAria}
              className="cursor-pointer"
            >
              <FolderPlus className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {!isLoading && data?.fullDiskAccessRequired && (
            <FullDiskAccessNotice onPick={() => void onPick()} />
          )}

          {isLoading && (
            <div role="status" aria-busy="true" className="space-y-3">
              <span className="sr-only">{L.backupList.scanningStatus}</span>
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          )}

          {/* Tarama hatası — önceden altta düz kırmızı metindi, yeniden deneme yoktu. */}
          {!isLoading && isError && !data && (
            <div className="mt-8">
              <RouteError
                title={L.backupList.scanError}
                error={error}
                onRetry={() => void refetch()}
              />
            </div>
          )}

          {!isLoading && data && data.backups.length === 0 && (
            <div className="mt-8 flex flex-col items-center text-center">
              <FolderSearch className="h-10 w-10 text-text-subtle" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-medium text-text">{L.backupList.emptyTitle}</h2>
              <p className="mt-1 max-w-md text-sm text-text-muted">
                {pickByPlatform({
                  win32: L.backupList.emptyHint,
                  darwin: L.backupList.emptyHintMac,
                  linux: L.backupList.emptyHintLinux,
                })}
              </p>
              {getPlatform() === 'linux' && (
                <div className="mt-3 flex flex-col items-center gap-1">
                  <span className="text-xs text-text-subtle">{L.backupList.linuxCommandLabel}</span>
                  <code
                    data-testid="linux-backup-command"
                    className="select-text rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-text"
                  >
                    {LINUX_BACKUP_COMMAND}
                  </code>
                </div>
              )}
              <div className="mt-6 flex gap-2">
                <Button onClick={onPick} className="cursor-pointer">
                  {L.backupList.pickFolderBtn}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => rescan.mutate()}
                  className="cursor-pointer"
                >
                  {L.backupList.rescanBtn}
                </Button>
              </div>
              <ScannedRoots roots={data.roots} />
            </div>
          )}

          {!isLoading &&
            data?.backups.map((b) => (
              <BackupCard
                key={`${b.rootPath}|${b.udid}`}
                backup={b}
                isOpening={openingUdid === b.udid}
                onClick={() => onSelect(b)}
              />
            ))}
        </div>

        <EncryptedDialog
          backup={unlockTarget}
          onClose={() => setUnlockTarget(null)}
          onUnlocked={onUnlocked}
        />
      </div>
    </div>
  );
}
