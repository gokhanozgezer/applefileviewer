import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShellLayout } from '@renderer/components/AppShellLayout';
import { useUIStore } from '@renderer/store/uiStore';

const summary = {
  udid: 'abc',
  rootPath: 'C:/Backup/abc',
  deviceName: 'iPhone',
  isEncrypted: false,
};

function setup(backups: (typeof summary)[]) {
  const open = vi.fn().mockResolvedValue({ ...summary, installedApps: [] });
  (window as unknown as { api: unknown }).api = {
    backup: {
      list: vi.fn().mockResolvedValue({ backups, errors: [] }),
      open,
    },
  };
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>yedek listesi</p> },
      {
        path: '/backup/:udid',
        element: <AppShellLayout />,
        children: [{ index: true, element: <p>genel bakış</p> }],
      },
    ],
    { initialEntries: ['/backup/abc'] },
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { open };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  useUIStore.setState({ activeBackup: null });
});

describe('aktif yedek çözümü (derin bağlantı / yeniden yükleme)', () => {
  it('store boşken URL udid’inden yedeği açar, ardından içeriği gösterir', async () => {
    const { open } = setup([summary]);
    expect(await screen.findByText('genel bakış')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith({ udid: 'abc', rootPath: 'C:/Backup/abc' });
    expect(useUIStore.getState().activeBackup).toMatchObject({
      udid: 'abc',
      rootPath: 'C:/Backup/abc',
    });
  });

  it('yedek listede yoksa yedek listesine yönlendirir (boş ekran yerine)', async () => {
    setup([]);
    expect(await screen.findByText('yedek listesi')).toBeInTheDocument();
  });
});
