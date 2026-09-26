import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModuleErrorScreen, NotFoundScreen } from '@renderer/components/state/ErrorScreens';
import { L } from '@renderer/i18n';

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error('modül patladı');
  return <p>modül içeriği</p>;
}

function renderRouter(initial: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>yedek listesi</p> },
      { path: '/mod', element: <Flaky />, errorElement: <ModuleErrorScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
    { initialEntries: [initial] },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  shouldThrow = true;
  // React/router render hatalarını konsola basar — beklenen, sessize al.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('router hata ekranları', () => {
  it('modül hatası dostane ekran gösterir; yeniden dene route’u yeniden mount eder', async () => {
    renderRouter('/mod');
    expect(screen.getByRole('alert')).toHaveTextContent(L.errors.moduleTitle);
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: L.common.retry }));
    expect(await screen.findByText('modül içeriği')).toBeInTheDocument();
  });

  it('yedeklere dön yedek listesine götürür', async () => {
    renderRouter('/mod');
    fireEvent.click(screen.getByRole('button', { name: L.errors.backToBackups }));
    expect(await screen.findByText('yedek listesi')).toBeInTheDocument();
  });

  it('bilinmeyen yol 404 ekranı gösterir', () => {
    renderRouter('/yok/boyle/bir/yer');
    expect(screen.getByRole('alert')).toHaveTextContent(L.errors.notFoundTitle);
  });
});
