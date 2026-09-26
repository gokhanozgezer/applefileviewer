import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@renderer/components/state/EmptyState';
import { Images } from 'lucide-react';

describe('renderer test ortamı', () => {
  it('jsdom + Testing Library çalışıyor (EmptyState render)', () => {
    render(<EmptyState icon={Images} title="Test başlığı" description="Açıklama satırı" />);
    expect(screen.getByText('Test başlığı')).toBeInTheDocument();
    expect(screen.getByText('Açıklama satırı')).toBeInTheDocument();
  });
});
