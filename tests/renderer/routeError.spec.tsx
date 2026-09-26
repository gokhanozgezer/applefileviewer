import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteError } from '@renderer/components/state/RouteError';
import { L } from '@renderer/i18n';

describe('RouteError', () => {
  it('başlık + alert rolü; yeniden dene onRetry çağırır', () => {
    const onRetry = vi.fn();
    render(<RouteError title="Okunamadı" error={new Error('boom')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Okunamadı');
    fireEvent.click(screen.getByRole('button', { name: L.common.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('detay katlanabilir ve hata mesajını gösterir', () => {
    render(<RouteError title="x" error={new Error('disk hatası')} onRetry={() => undefined} />);
    expect(screen.queryByText('disk hatası')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: L.common.showDetail });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('disk hatası')).toBeInTheDocument();
  });
});
