import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShellLayout } from './components/AppShellLayout';
import { TitleBar } from './components/TitleBar';
import { CommandPalette } from './components/CommandPalette';
import { UpdateBanner } from './components/UpdateBanner';
import { AppToaster } from './components/ui/toast';
import {
  AppErrorBoundary,
  ModuleErrorScreen,
  NotFoundScreen,
} from './components/state/ErrorScreens';
import { useUIStore } from './store/uiStore';
import { BackupList } from './routes/BackupList';
import { BackupOverview } from './routes/BackupOverview';
import { PhotosRoute } from './routes/photos/PhotosRoute';
import { MessagesRoute } from './routes/messages/MessagesRoute';
import { WhatsAppRoute } from './routes/whatsapp/WhatsAppRoute';
import { CallsRoute } from './routes/calls/CallsRoute';
import { VoicemailRoute } from './routes/voicemail/VoicemailRoute';
import { NotesRoute } from './routes/notes/NotesRoute';
import { VoiceMemosRoute } from './routes/voicememos/VoiceMemosRoute';
import { ContactsRoute } from './routes/contacts/ContactsRoute';
import { SettingsRoute } from './routes/settings/SettingsRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Kök layout — TÜM route'larda (yedek listesi + modüller + ayarlar) 40px özel
// TitleBar (sürükleme bölgesi; main: titleBarStyle 'hidden' + titleBarOverlay).
// TitleBar navigate/useUIStore kullandığı için router context İÇİNDE olmalı →
// pathless layout route. CommandPalette de burada BİR KEZ mount edilir
// (state uiStore'da; TitleBar butonu + Ctrl+K aynı paleti açar).
function RootLayout() {
  const paletteOpen = useUIStore((s) => s.paletteOpen);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  // Dil değişince görünür ağacın tamamı remount olsun diye key={locale} —
  // RouterProvider'a DEĞİL bu iç wrapper'a: aktif route korunur (memory router),
  // TitleBar + Outlet (AppShellLayout/help overlay dahil) + CommandPalette
  // yeni sözlükle yeniden render edilir.
  const locale = useUIStore((s) => s.locale);
  return (
    <div key={locale} className="flex h-screen flex-col overflow-hidden bg-bg text-text">
      <TitleBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <UpdateBanner />
    </div>
  );
}

// Her route kendi errorElement'ini taşır: modül render hatası yalnızca o
// modülün alanını hata ekranına çevirir (sidebar/TitleBar yerinde kalır).
// Kök layout'taki errorElement son çaredir (layout'un kendisi patlarsa).
const moduleError = <ModuleErrorScreen />;

const router = createMemoryRouter(
  [
    {
      element: <RootLayout />,
      errorElement: moduleError,
      children: [
        {
          path: '/',
          element: <BackupList />,
          errorElement: moduleError,
        },
        {
          // Ayarlar — top-level route (:udid'e bağımlı DEĞİL, yedek açık olmadan çalışır).
          // AppShellLayout yeniden kullanılır: sidebar + global keymap + help overlay.
          path: '/settings',
          element: <AppShellLayout />,
          errorElement: moduleError,
          children: [{ index: true, element: <SettingsRoute />, errorElement: moduleError }],
        },
        {
          path: '/backup/:udid',
          element: <AppShellLayout />,
          errorElement: moduleError,
          children: [
            { index: true, element: <BackupOverview />, errorElement: moduleError },
            // Lightbox artık route DEĞİL — PhotosRoute içinde overlay state
            // (lightboxIndex) olarak render olur. Grid mount kalır → react-window
            // scroll pozisyonu korunur, galeri navigasyonu akıcı.
            { path: 'photos', element: <PhotosRoute />, errorElement: moduleError },
            { path: 'messages', element: <MessagesRoute />, errorElement: moduleError },
            { path: 'whatsapp', element: <WhatsAppRoute />, errorElement: moduleError },
            { path: 'calls', element: <CallsRoute />, errorElement: moduleError },
            { path: 'voicemail', element: <VoicemailRoute />, errorElement: moduleError },
            { path: 'notes', element: <NotesRoute />, errorElement: moduleError },
            { path: 'voicememos', element: <VoiceMemosRoute />, errorElement: moduleError },
            { path: 'contacts', element: <ContactsRoute />, errorElement: moduleError },
          ],
        },
        // Catch-all 404 — bilinmeyen yol (bozuk derin bağlantı vb.).
        { path: '*', element: <NotFoundScreen /> },
      ],
    },
  ],
  {
    // Router-level v7 future flag opt-in (v7_startTransition RouterProvider'a verilir):
    // - v7_relativeSplatPath: splat route çözümü (bizde splat yok, ileriye dönük)
    future: {
      v7_relativeSplatPath: true,
    },
  },
);

export function App() {
  return (
    // Router dışı son çare sınırı — errorElement'lerin yakalayamadığı hatalar
    // (QueryClient/Toaster/RouterProvider) beyaz ekran yerine yeniden yükleme sunar.
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <AppToaster />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
