import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { BackupDetails, BackupSummary, ScanResult } from '@shared/domain';
import { useUIStore } from '../store/uiStore';

export function useBackupList(enabled = true) {
  return useQuery<ScanResult>({
    queryKey: ['backup', 'list'],
    queryFn: () => window.api.backup.list(),
    enabled,
  });
}

export function useRescanBackups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.backup.rescan(),
    onSuccess: (data) => qc.setQueryData(['backup', 'list'], data),
  });
}

export function useOpenBackup() {
  const qc = useQueryClient();
  const setActiveBackup = useUIStore((s) => s.setActiveBackup);
  return useMutation<BackupDetails, Error, { udid: string; rootPath: string }>({
    mutationFn: ({ udid, rootPath }) => window.api.backup.open({ udid, rootPath }),
    onSuccess: (data, { udid, rootPath }) => {
      // BackupOverview aynı anahtarı okur — ikinci backup.open IPC'sine gerek kalmaz.
      qc.setQueryData(['backup', 'details', udid], data);
      setActiveBackup({ udid, rootPath, deviceName: data.deviceName, encrypted: data.isEncrypted });
    },
  });
}

export function usePickBackupFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.backup.pickFolder(),
    onSuccess: (res) => {
      if (!res.canceled && res.valid) qc.invalidateQueries({ queryKey: ['backup', 'list'] });
    },
  });
}

/**
 * Aktif (açık) şifreli yedeği kilitler: main oturumu kapatır ve düz metni siler; renderer
 * tarafında yedeğe ait tüm sorgu önbelleği (mesajlar, kişiler…) bellekten atılır.
 * Çağıran ÖNCE yedek listesine yönlendirmeli — modül ekranları açıkken sorgular kilitli
 * yedeğe yeniden istek atmasın. Bileşen yaşam döngüsünden bağımsız (Sidebar unmount olur).
 * @returns kilitleme IPC'si başarılı mı
 */
export async function lockBackup(qc: QueryClient, udid: string): Promise<boolean> {
  let ok = true;
  try {
    await window.api.backup.lock({ udid });
  } catch {
    ok = false;
  }
  const { activeBackup, setActiveBackup } = useUIStore.getState();
  if (activeBackup?.udid === udid) setActiveBackup(null);
  // Liste dışındaki tüm sorgular (bu yedeğin çözülmüş verisi) bellekten silinir.
  qc.removeQueries({
    predicate: (q) => !(q.queryKey[0] === 'backup' && q.queryKey[1] === 'list'),
  });
  await qc.invalidateQueries({ queryKey: ['backup', 'list'] });
  return ok;
}

export type ActiveBackupStatus =
  | { state: 'ready' }
  | { state: 'resolving' }
  | { state: 'missing' }
  /** Şifreli yedek kilitli — çağıran kilit açma dialog'unu gösterir. */
  | { state: 'locked'; backup: BackupSummary; onUnlocked: () => Promise<void> }
  | { state: 'error'; error: unknown; retry: () => void };

/**
 * /backup/:udid altındaki route'lar için aktif yedeği URL'deki udid'den çözer.
 *
 * Modül route'ları `enabled: !!activeBackup` kalıbını kullanır; activeBackup
 * null iken (yeniden yükleme / derin bağlantı / farklı udid'e navigate) sorgular
 * hiç başlamaz, isLoading false kalır ve ekranlar yanlışlıkla BOŞ görünürdü.
 * Bu hook sorunu kaynağında çözer: store'daki yedek URL'deki udid ile
 * eşleşmiyorsa yedek listesinden rootPath bulunur, backup.open çağrılır ve
 * store doldurulur. Bulunamayan / şifrelemesi bilinmeyen yedek → 'missing' (çağıran
 * yönlendirir); kilitli şifreli yedek → 'locked' (çağıran kilit açma dialog'unu gösterir,
 * kilit açılınca liste tazelenir ve açma akışı kaldığı yerden sürer).
 * udid yoksa (ör. /settings) daima 'ready'.
 */
export function useEnsureActiveBackup(udid: string | undefined): ActiveBackupStatus {
  const activeBackup = useUIStore((s) => s.activeBackup);
  const setActiveBackup = useUIStore((s) => s.setActiveBackup);
  const needsResolve = udid !== undefined && activeBackup?.udid !== udid;

  const list = useBackupList(needsResolve);
  const summary = list.data?.backups.find((b) => b.udid === udid && !b.encryptionUnknown);
  const locked = !!summary && summary.isEncrypted && summary.unlocked !== true;

  const details = useQuery<BackupDetails>({
    queryKey: ['backup', 'details', udid],
    queryFn: () => window.api.backup.open({ udid: udid!, rootPath: summary!.rootPath }),
    enabled: needsResolve && !!summary && !locked,
  });

  useEffect(() => {
    if (!needsResolve || !summary || locked || !details.data) return;
    setActiveBackup({
      udid: summary.udid,
      rootPath: summary.rootPath,
      deviceName: details.data.deviceName,
      encrypted: details.data.isEncrypted,
    });
  }, [needsResolve, summary, locked, details.data, setActiveBackup]);

  if (!needsResolve) return { state: 'ready' };
  if (list.isError) return { state: 'error', error: list.error, retry: () => void list.refetch() };
  if (list.data && !summary) return { state: 'missing' };
  if (summary && locked) {
    return {
      state: 'locked',
      backup: summary,
      // Liste tazelenince summary.unlocked=true → details (backup.open) sorgusu başlar.
      onUnlocked: async () => {
        await list.refetch();
      },
    };
  }
  if (details.isError) {
    return { state: 'error', error: details.error, retry: () => void details.refetch() };
  }
  return { state: 'resolving' };
}
