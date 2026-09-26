import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListSkeleton } from '@renderer/components/state/ListSkeleton';
import { L } from '@renderer/i18n';

describe('ListSkeleton a11y', () => {
  it('role=status + aria-busy ve varsayılan sr-only yükleme metni', () => {
    render(<ListSkeleton rows={3} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent(L.common.loading);
  });

  it('label prop ekran okuyucu metnini değiştirir; satırlar aria-hidden', () => {
    const { container } = render(<ListSkeleton rows={4} label="Mesajlar yükleniyor…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Mesajlar yükleniyor…');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});
