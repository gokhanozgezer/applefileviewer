// Ayarlar > Güncellemeler bölümü + sessiz kontrol banner'ı — durum bazlı UI.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UpdateSection } from '@renderer/components/UpdateSection';
import { UpdateBanner, __resetUpdateBannerForTests } from '@renderer/components/UpdateBanner';
import { L } from '@renderer/i18n';
import type { UpdateSnapshot, UpdateState } from '@shared/ipc';

const RELEASES = 'https://github.com/gokhanozgezer/applefileviewer/releases';

function snap(state: UpdateState, over: Partial<UpdateSnapshot> = {}): UpdateSnapshot {
  return {
    currentVersion: '0.1.0',
    kind: 'win-nsis',
    mode: 'auto',
    autoCheck: true,
    releasesUrl: RELEASES,
    lastCheckAt: null,
    state,
    ...over,
  };
}

let pushCb: ((s: UpdateSnapshot) => void) | null = null;
const api = {
  get: vi.fn<() => Promise<UpdateSnapshot>>(),
  check: vi.fn<() => Promise<UpdateSnapshot>>(),
  download: vi.fn<() => Promise<UpdateSnapshot>>(),
  install: vi.fn<() => Promise<void>>(),
  setAutoCheck: vi.fn<(v: boolean) => Promise<UpdateSnapshot>>(),
  openExternal: vi.fn<(t: string) => Promise<boolean>>(),
  onPush: vi.fn((cb: (s: UpdateSnapshot) => void) => {
    pushCb = cb;
    return () => {
      pushCb = null;
    };
  }),
};

beforeEach(() => {
  pushCb = null;
  __resetUpdateBannerForTests();
  (window as unknown as { api: unknown }).api = { updater: api };
});

async function renderSection(s: UpdateSnapshot) {
  api.get.mockResolvedValue(s);
  render(<UpdateSection />);
  await screen.findByTestId('update-section');
}

describe('UpdateSection', () => {
  it('dev: bilgi metni, denetle devre dışı, releases sayfası açılabilir', async () => {
    await renderSection(snap({ status: 'idle' }, { kind: 'dev', mode: 'disabled' }));
    expect(screen.getByText(L.update.devOnly)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.update.check })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: L.update.openReleases }));
    expect(api.openExternal).toHaveBeenCalledWith('releases');
  });

  it('auto + available: "İndir ve kur" indirir; notlar düz metin', async () => {
    const html = '<img src=x onerror="alert(1)">notlar';
    api.download.mockResolvedValue(
      snap({
        status: 'downloading',
        version: '0.2.0',
        percent: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
      }),
    );
    await renderSection(
      snap({ status: 'available', version: '0.2.0', notes: html, date: null, origin: 'manual' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('0.2.0');
    // Uzak içerik HTML olarak yorumlanmaz
    expect(screen.getByTestId('update-notes').textContent).toBe(html);
    expect(screen.getByTestId('update-notes').querySelector('img')).toBeNull();
    expect(screen.queryByRole('button', { name: L.update.downloadFromGitHub })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: L.update.downloadAndInstall }));
    });
    expect(api.download).toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('downloading: ilerleme çubuğu + push ile güncellenir', async () => {
    await renderSection(
      snap({
        status: 'downloading',
        version: '0.2.0',
        percent: 10,
        bytesPerSecond: 2048,
        transferred: 1,
        total: 10,
      }),
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByRole('button', { name: L.update.check })).toBeDisabled();
    act(() => {
      pushCb?.(
        snap({
          status: 'downloading',
          version: '0.2.0',
          percent: 73.4,
          bytesPerSecond: 1,
          transferred: 7,
          total: 10,
        }),
      );
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '73');
  });

  it('downloaded: "Yeniden başlat ve güncelle" yalnız tıklamayla kurar', async () => {
    api.install.mockResolvedValue(undefined);
    await renderSection(snap({ status: 'downloaded', version: '0.2.0', notes: null, date: null }));
    expect(api.install).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: L.update.restartAndUpdate }));
    });
    expect(api.install).toHaveBeenCalledTimes(1);
  });

  it('mac (notify): kurulum düğmesi yok, "GitHub’dan indir" download hedefini açar', async () => {
    await renderSection(
      snap(
        {
          status: 'available',
          version: '0.2.0',
          notes: 'x',
          date: '2026-09-01T00:00:00Z',
          origin: 'manual',
        },
        { kind: 'mac', mode: 'notify' },
      ),
    );
    expect(screen.getByText(L.update.macHint)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: L.update.downloadAndInstall })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: L.update.downloadFromGitHub }));
    expect(api.openExternal).toHaveBeenCalledWith('download');
  });

  it('not-available / error metinleri; denetle düğmesi check çağırır', async () => {
    api.check.mockResolvedValue(snap({ status: 'not-available' }));
    await renderSection(snap({ status: 'error', message: 'net::ERR' }));
    expect(screen.getByRole('status')).toHaveTextContent(`${L.update.errorPrefix} net::ERR`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: L.update.check }));
    });
    expect(api.check).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(L.update.upToDate);
  });

  it('otomatik denetim anahtarı setAutoCheck çağırır', async () => {
    api.setAutoCheck.mockResolvedValue(snap({ status: 'idle' }, { autoCheck: false }));
    await renderSection(snap({ status: 'idle' }));
    const sw = screen.getByRole('switch', { name: new RegExp(L.update.autoCheck) });
    expect(sw).toBeChecked();
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(api.setAutoCheck).toHaveBeenCalledWith(false);
    expect(sw).not.toBeChecked();
  });

  it('IPC hatası yutulmaz (UI çökmez)', async () => {
    api.check.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderSection(snap({ status: 'idle' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: L.update.check }));
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('releasesUrl yoksa bağlantı gösterilmez', async () => {
    await renderSection(snap({ status: 'idle' }, { releasesUrl: null }));
    expect(screen.queryByRole('button', { name: L.update.openReleases })).toBeNull();
  });
});

function renderBanner(s: UpdateSnapshot, path = '/') {
  api.get.mockResolvedValue(s);
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<UpdateBanner />} />
        <Route path="/settings" element={<div data-testid="settings-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UpdateBanner', () => {
  const silent = snap({
    status: 'available',
    version: '0.2.0',
    notes: null,
    date: null,
    origin: 'silent',
  });

  it('sessiz kontrolde görünür; "Görüntüle" ayarlara götürür', async () => {
    renderBanner(silent);
    expect(await screen.findByTestId('update-banner')).toHaveTextContent('0.2.0');
    fireEvent.click(screen.getByRole('button', { name: L.update.view }));
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
  });

  it('kapatılabilir; manuel kontrolde çıkmaz', async () => {
    renderBanner(silent);
    await screen.findByTestId('update-banner');
    fireEvent.click(screen.getByRole('button', { name: L.update.dismissAria }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('manuel kontrol sonucu banner göstermez', async () => {
    renderBanner(
      snap({ status: 'available', version: '0.3.0', notes: null, date: null, origin: 'manual' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });
});
