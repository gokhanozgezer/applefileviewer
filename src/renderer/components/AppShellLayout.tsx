import { useEffect } from 'react';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ShortcutsHelpDialog } from './ShortcutsHelpDialog';
import { RouteError } from './state/RouteError';
import { EncryptedDialog } from './EncryptedDialog';
import { notify } from './ui/toast';
import { useGlobalKeymap } from '../hooks/useGlobalKeymap';
import { useEnsureActiveBackup } from '../hooks/useBackups';
import { L } from '../i18n';

/** /backup/:udid altında aktif yedek çözülene kadar modül içeriği yerine gösterilir. */
function BackupGate() {
  const { udid } = useParams<{ udid: string }>();
  const navigate = useNavigate();
  const status = useEnsureActiveBackup(udid);

  useEffect(() => {
    if (status.state === 'missing') notify.warning(L.errors.backupNotFound);
  }, [status.state]);

  if (status.state === 'ready') return <Outlet />;
  if (status.state === 'missing') return <Navigate to="/" replace />;
  if (status.state === 'locked') {
    // Derin bağlantı / yeniden açma: kilitli şifreli yedek → hata yerine kilit açma formu.
    // Vazgeç → yedek listesi; kilit açılınca liste tazelenir ve açma akışı sürer.
    return (
      <EncryptedDialog
        backup={status.backup}
        onClose={() => navigate('/')}
        onUnlocked={status.onUnlocked}
      />
    );
  }
  if (status.state === 'error') {
    return (
      <div className="flex h-full flex-col">
        <RouteError title={L.errors.backupOpenError} error={status.error} onRetry={status.retry} />
        <div className="flex justify-center pb-10">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text"
          >
            {L.errors.backToBackups}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex h-full items-center justify-center gap-2 text-text-muted"
    >
      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
      <span className="text-sm">{L.errors.resolvingBackup}</span>
    </div>
  );
}

export function AppShellLayout() {
  // Global kısayollar (keymap.ts) — tek keydown listener, BİR KEZ burada mount edilir.
  // CommandPalette artık RootLayout'ta (App.tsx) — palet state'i uiStore'da.
  const { helpOpen, setHelpOpen } = useGlobalKeymap();

  return (
    // h-full (h-screen DEĞİL) — üstte 40px TitleBar var (RootLayout flex-col).
    <div className="flex h-full bg-bg text-text">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* Modül route'ları `enabled: !!activeBackup` ile sorgu başlatır — store
            URL'deki udid ile eşleşene kadar içerik render EDİLMEZ (boş ekran yerine
            yükleniyor / yönlendirme). /settings'te udid yok → doğrudan Outlet. */}
        <BackupGate />
      </main>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
