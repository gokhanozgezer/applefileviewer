import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EncryptedDialog, type UnlockTarget } from '@renderer/components/EncryptedDialog';
import { BackupCard } from '@renderer/components/BackupCard';
import { AppShellLayout } from '@renderer/components/AppShellLayout';
import { useUIStore } from '@renderer/store/uiStore';
import { L } from '@renderer/i18n';
import type { BackupSummary } from '@shared/domain';

const target: UnlockTarget = { udid: 'enc', rootPath: 'C:/Backup', deviceName: 'Encrypted iPhone' };

function setupApi(unlock: ReturnType<typeof vi.fn>) {
  (window as unknown as { api: unknown }).api = { backup: { unlock } };
}

function renderDialog(onUnlocked = vi.fn(), onClose = vi.fn()) {
  render(<EncryptedDialog backup={target} onClose={onClose} onUnlocked={onUnlocked} />);
  return { onUnlocked, onClose, input: screen.getByLabelText(L.unlock.passwordLabel) };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('EncryptedDialog (kilit açma formu)', () => {
  it('parola alanı otomatik odaklı; gizlilik notu görünür; Enter gönderir → onUnlocked', async () => {
    const unlock = vi.fn().mockResolvedValue({ status: 'ok' });
    setupApi(unlock);
    const { onUnlocked, input } = renderDialog();
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByText(L.unlock.privacyNote)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.unlock.submit })).toBeDisabled();
    await userEvent.type(input, 'gizli{Enter}');
    expect(unlock).toHaveBeenCalledWith({ udid: 'enc', rootPath: 'C:/Backup', password: 'gizli' });
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith(target));
  });

  it('yanlış parola → satır içi hata, alan yeniden odaklı + seçili, onUnlocked çağrılmaz', async () => {
    setupApi(vi.fn().mockResolvedValue({ status: 'wrongPassword' }));
    const { onUnlocked, input } = renderDialog();
    await userEvent.type(input, 'yanlis');
    await userEvent.click(screen.getByRole('button', { name: L.unlock.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.unlock.wrongPassword);
    const el = input as HTMLInputElement;
    await waitFor(() => expect(el).toHaveFocus());
    expect(el.value).toBe('yanlis');
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(el.value.length);
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('genel hata → ayrıntılı mesaj', async () => {
    setupApi(vi.fn().mockResolvedValue({ status: 'error', message: 'Manifest.plist okunamadı' }));
    const { input } = renderDialog();
    await userEvent.type(input, 'x{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Manifest\.plist okunamadı/);
  });

  it('meşgul durumu: girişler kilitli, aria-busy, ilerleme metni; bitince onUnlocked', async () => {
    let resolve!: (v: unknown) => void;
    setupApi(vi.fn().mockReturnValue(new Promise((r) => (resolve = r))));
    const { onUnlocked, onClose, input } = renderDialog();
    await userEvent.type(input, 'p{Enter}');
    expect(input).toBeDisabled();
    expect(input.closest('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(L.unlock.busy);
    expect(screen.getByRole('button', { name: L.unlock.cancel })).toBeDisabled();
    // Esc meşgulken dialog'u kapatmaz
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    resolve({ status: 'ok' });
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
  });

  it('Caps Lock açıkken uyarı gösterilir, kapanınca gizlenir', () => {
    setupApi(vi.fn());
    const { input } = renderDialog();
    expect(screen.queryByText(L.unlock.capsLock)).toBeNull();
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText(L.unlock.capsLock)).toBeInTheDocument();
    fireEvent.keyUp(input, { key: 'A', modifierCapsLock: false });
    expect(screen.queryByText(L.unlock.capsLock)).toBeNull();
  });

  it('göster/gizle düğmesi alan tipini değiştirir', async () => {
    setupApi(vi.fn());
    const { input } = renderDialog();
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: L.unlock.showPassword }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: L.unlock.hidePassword }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('BackupCard kilit rozeti', () => {
  const base: BackupSummary = {
    udid: 'enc',
    rootPath: 'C:/Backup',
    source: 'itunes',
    deviceName: 'Encrypted iPhone',
    productType: null,
    productName: null,
    productVersion: null,
    isEncrypted: true,
    encryptionUnknown: false,
    lastBackupDate: null,
    totalSizeBytes: null,
    parseError: null,
  };
  it('kilitli / kilidi açık', () => {
    const { rerender } = render(<BackupCard backup={base} onClick={() => undefined} />);
    expect(screen.getByTestId('backup-lock-badge')).toHaveTextContent(L.unlock.lockedBadge);
    rerender(<BackupCard backup={{ ...base, unlocked: true }} onClick={() => undefined} />);
    expect(screen.getByTestId('backup-lock-badge')).toHaveTextContent(L.unlock.unlockedBadge);
  });

  it('şifresiz yedekte rozet yok', () => {
    render(<BackupCard backup={{ ...base, isEncrypted: false }} onClick={() => undefined} />);
    expect(screen.queryByTestId('backup-lock-badge')).toBeNull();
  });
});

describe('derin bağlantı: kilitli şifreli yedek', () => {
  it('yönlendirme/hata yerine kilit açma formu; kilit açılınca yedek açılır', async () => {
    const summary = { udid: 'enc', rootPath: 'C:/Backup', deviceName: 'Enc', isEncrypted: true };
    let unlocked = false;
    const list = vi.fn(async () => ({ backups: [{ ...summary, unlocked }], errors: [] }));
    const open = vi.fn().mockResolvedValue({ ...summary, installedApps: [] });
    const unlock = vi.fn(async () => {
      unlocked = true;
      return { status: 'ok' };
    });
    (window as unknown as { api: unknown }).api = { backup: { list, open, unlock } };
    useUIStore.setState({ activeBackup: null });
    const router = createMemoryRouter(
      [
        { path: '/', element: <p>yedek listesi</p> },
        {
          path: '/backup/:udid',
          element: <AppShellLayout />,
          children: [{ index: true, element: <p>genel bakış</p> }],
        },
      ],
      { initialEntries: ['/backup/enc'] },
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const input = await screen.findByLabelText(L.unlock.passwordLabel);
    expect(open).not.toHaveBeenCalled();
    await userEvent.type(input, 'dogru{Enter}');
    expect(await screen.findByText('genel bakış')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith({ udid: 'enc', rootPath: 'C:/Backup' });
    // Kilitle eylemi açık şifreli yedekte görünür
    await waitFor(() =>
      expect(screen.getByRole('button', { name: L.unlock.lockAction })).toBeInTheDocument(),
    );
  });
});
