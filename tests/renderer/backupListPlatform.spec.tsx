// BackupList — platforma göre boş durum + macOS Tam Disk Erişimi uyarısı + kök etiketi.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ScanResult } from '@shared/domain';
import { BackupList } from '@renderer/routes/BackupList';
import { L } from '@renderer/i18n';

const MAC_ROOT = '/Users/u/Library/Application Support/MobileSync/Backup';

function setup(platform: string, scan: Partial<ScanResult>) {
  const openFda = vi.fn().mockResolvedValue({ opened: true });
  const result: ScanResult = {
    roots: [],
    overridePath: null,
    overridePathAccessible: false,
    fullDiskAccessRequired: false,
    backups: [],
    errors: [],
    ...scan,
  };
  (window as unknown as { api: unknown }).api = {
    platform,
    backup: {
      list: vi.fn().mockResolvedValue(result),
      openFullDiskAccessSettings: openFda,
    },
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BackupList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { openFda };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  (window as unknown as { api: unknown }).api = undefined;
});

describe('BackupList — platform', () => {
  it('macOS izin yok: Tam Disk Erişimi uyarısı + Sistem Ayarları düğmesi IPC çağırır', async () => {
    const { openFda } = setup('darwin', {
      roots: [{ path: MAC_ROOT, source: 'finder', state: 'permissionDenied' }],
      fullDiskAccessRequired: true,
    });
    expect(await screen.findByTestId('fda-notice')).toBeInTheDocument();
    expect(screen.getByText(L.backupList.fdaTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: L.backupList.fdaOpenSettings }));
    expect(openFda).toHaveBeenCalledOnce();
    // Taranan kök ve durumu listelenir
    expect(screen.getByText(MAC_ROOT)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(L.backupList.rootStates.permissionDenied))).toBeTruthy();
  });

  it('Linux boş durum: idevicebackup2 açıklaması + örnek komut, FDA uyarısı yok', async () => {
    setup('linux', {});
    expect(await screen.findByText(L.backupList.emptyHintLinux)).toBeInTheDocument();
    expect(screen.getByTestId('linux-backup-command').textContent).toMatch(/idevicebackup2 backup/);
    expect(screen.queryByTestId('fda-notice')).toBeNull();
  });

  it('Windows boş durum: iTunes + Apple Aygıtları kökleri listelenir', async () => {
    setup('win32', {
      roots: [
        { path: 'C:\\A\\Apple Computer\\MobileSync\\Backup', source: 'itunes', state: 'missing' },
        { path: 'C:\\U\\Apple\\MobileSync\\Backup', source: 'appleDevices', state: 'missing' },
      ],
    });
    expect(await screen.findByText(L.backupList.emptyHint)).toBeInTheDocument();
    expect(screen.getByText('C:\\U\\Apple\\MobileSync\\Backup')).toBeInTheDocument();
    expect(screen.queryByTestId('linux-backup-command')).toBeNull();
  });

  it('yedek kartı hangi kökten geldiğini gösterir', async () => {
    setup('win32', {
      backups: [
        {
          udid: 'a'.repeat(40),
          rootPath: 'C:\\U\\Apple\\MobileSync\\Backup',
          source: 'appleDevices',
          deviceName: 'iPhone',
          productType: null,
          productName: null,
          productVersion: null,
          isEncrypted: false,
          encryptionUnknown: false,
          lastBackupDate: null,
          totalSizeBytes: null,
          parseError: null,
        },
      ],
    });
    const src = await screen.findByTestId('backup-source');
    expect(src).toHaveAttribute('data-source', 'appleDevices');
    expect(src.textContent).toBe(L.backupList.sources.appleDevices);
  });
});
