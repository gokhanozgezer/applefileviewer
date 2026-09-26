// src/renderer/components/state/ErrorScreens.tsx
// Router seviyesi hata ekranları:
//  - ModuleErrorScreen: route `errorElement` — modül render'ında fırlatılan
//    hata tüm uygulamayı beyaz ekrana düşürmez; sidebar yerinde kalır,
//    yeniden dene (aynı konuma navigate → router hata state'i sıfırlanır) +
//    yedek listesine dön.
//  - NotFoundScreen: catch-all `*` route (ve 404 route hataları).
//  - AppErrorBoundary: router DIŞI (QueryClient/Toaster/RouterProvider) son çare.
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom';
import { AlertTriangle, Compass } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { L } from '../../i18n';

const PRIMARY_BTN =
  'cursor-pointer rounded-md bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-fast hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';
const SECONDARY_BTN =
  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  return String(error);
}

interface ErrorLayoutProps {
  icon: typeof AlertTriangle;
  iconClassName: string;
  title: string;
  hint: string;
  error?: unknown;
  actions: ReactNode;
}

/** Ortak tam-alan hata düzeni — RouteError ile aynı görsel dil (ikon + başlık + eylemler). */
function ErrorLayout({ icon: Icon, iconClassName, title, hint, error, actions }: ErrorLayoutProps) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div
      role="alert"
      className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <Icon className={`h-10 w-10 ${iconClassName}`} strokeWidth={1.5} aria-hidden="true" />
      <h1 className="text-base font-medium text-text">{title}</h1>
      <p className="max-w-md text-sm text-text-muted">{hint}</p>
      <div className="mt-1 flex items-center gap-2">{actions}</div>
      {error !== undefined && (
        <>
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
              {errorMessage(error)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/** Catch-all 404 ekranı. */
export function NotFoundScreen() {
  const navigate = useNavigate();
  return (
    <ErrorLayout
      icon={Compass}
      iconClassName="text-text-subtle"
      title={L.errors.notFoundTitle}
      hint={L.errors.notFoundHint}
      actions={
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className={PRIMARY_BTN}
        >
          {L.errors.backToBackups}
        </button>
      }
    />
  );
}

/** Route `errorElement` — modül seviyesi dostane hata ekranı. */
export function ModuleErrorScreen() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />;

  const retry = () => {
    // Hatalı sorguları sıfırla + aynı konuma navigate → router errors state'i temizlenir,
    // route elementi yeniden mount olur.
    void queryClient.resetQueries({ predicate: (q) => q.state.status === 'error' });
    navigate(`${location.pathname}${location.search}`, { replace: true });
  };

  return (
    <ErrorLayout
      icon={AlertTriangle}
      iconClassName="text-warning"
      title={L.errors.moduleTitle}
      hint={L.errors.moduleHint}
      error={error}
      actions={
        <>
          <button type="button" onClick={retry} className={PRIMARY_BTN}>
            {L.common.retry}
          </button>
          <button type="button" onClick={() => navigate('/')} className={SECONDARY_BTN}>
            {L.errors.backToBackups}
          </button>
        </>
      }
    />
  );
}

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: unknown;
}

/** Router dışı son çare sınırı — yakalanamayan render hatasında uygulamayı yeniden yükler. */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: error ?? new Error('Unknown error') };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  override render() {
    if (this.state.error === undefined) return this.props.children;
    return (
      <div className="h-screen bg-bg text-text">
        <ErrorLayout
          icon={AlertTriangle}
          iconClassName="text-danger"
          title={L.errors.appTitle}
          hint={L.errors.appHint}
          error={this.state.error}
          actions={
            <button type="button" onClick={() => window.location.reload()} className={PRIMARY_BTN}>
              {L.errors.reload}
            </button>
          }
        />
      </div>
    );
  }
}
