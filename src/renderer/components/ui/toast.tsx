// src/renderer/components/ui/toast.tsx
// Hafif bildirim katmanı — sonner üzerine ince sarmalayıcı. Tüm ekranlar
// doğrudan `sonner` yerine buradan import eder:
//   import { notify, copyToClipboard } from '<relative>/components/ui/toast';
// Toaster bir aria-live bölgesi (section[aria-live=polite]) render eder —
// ekran okuyucular bildirimleri duyurur. Tema uiStore'dan izlenir.
import { Toaster, toast } from 'sonner';
import { useUIStore } from '../../store/uiStore';
import { L } from '../../i18n';

/** Uygulama geneli bildirim API'si — sonner'ın tip-güvenli alt kümesi. */
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast.warning(message),
  info: (message: string) => toast.info(message),
};

/**
 * Metni panoya kopyalar ve sonucu bildirir. Başarı mesajı özelleştirilebilir;
 * hata YUTULMAZ — kullanıcıya "kopyalanamadı" bildirimi gösterilir.
 * @returns kopyalama başarılı mı
 */
export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    notify.success(successMessage ?? L.common.copied);
    return true;
  } catch {
    notify.error(L.common.copyError);
    return false;
  }
}

/** Kökte BİR KEZ mount edilir (App.tsx). Aktif temaya uyar. */
export function AppToaster() {
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  return (
    <Toaster
      richColors
      position="bottom-right"
      theme={resolvedTheme}
      closeButton
      containerAriaLabel={L.common.notificationsAria}
    />
  );
}
