import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from '@renderer/components/Sidebar';
import { useUIStore } from '@renderer/store/uiStore';
import { L } from '@renderer/i18n';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/backup/:udid/*" element={<Sidebar />} />
        <Route path="/settings" element={<Sidebar />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // useTheme preload köprüsü yokken uyarı loglar — test çıktısını kirletmesin.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  useUIStore.setState({ sidebarCollapsed: false });
});

describe('Sidebar', () => {
  it('yedek açıkken tüm modüller link; aktif olan aria-current taşır', () => {
    renderAt('/backup/abc/messages');
    const nav = screen.getByRole('navigation');
    expect(nav.querySelectorAll('a')).toHaveLength(9);
    const messages = screen.getByRole('link', { name: L.sidebar.messages });
    expect(messages).toHaveAttribute('href', '/backup/abc/messages');
    expect(messages).toHaveAttribute('aria-current', 'page');
  });

  it('yedek yokken (/settings) modüller devre dışı', () => {
    renderAt('/settings');
    const nav = screen.getByRole('navigation');
    expect(nav.querySelectorAll('a')).toHaveLength(0);
    expect(nav.querySelectorAll('[aria-disabled="true"]')).toHaveLength(9);
  });

  it('daralt/genişlet düğmesi store durumunu değiştirir, etiketleri gizler', () => {
    renderAt('/backup/abc');
    const toggle = screen.getByRole('button', { name: L.sidebar.collapse });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(L.sidebar.photos)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    const expandBtn = screen.getByRole('button', { name: L.sidebar.expand });
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
    // Daraltılmışken görünür metin yok, erişilebilir ad korunur.
    expect(screen.queryByText(L.sidebar.photos)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: L.sidebar.photos })).toBeInTheDocument();
  });
});
