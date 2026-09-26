import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PhotoAlbum } from '@shared/domain';
import { FilterBar } from '@renderer/routes/photos/FilterBar';
import { getActiveLocale, setActiveLocale, type Locale } from '@renderer/i18n';

const ALBUMS: PhotoAlbum[] = [
  { id: 'smart:videos', kind: 'smart', title: null, smartKey: 'videos', count: 12 },
  { id: 'album:10', kind: 'user', title: 'Tatil', count: 3 },
];

let prevLocale: Locale;
beforeAll(() => {
  // jsdom'da yok — Select açılınca aktif seçeneği görünür kılmak için çağırıyor.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
  prevLocale = getActiveLocale();
  setActiveLocale('tr');
});
afterAll(() => setActiveLocale(prevLocale));

function setup(over: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props: React.ComponentProps<typeof FilterBar> = {
    favoritesOnly: false,
    includeHidden: false,
    onToggleFavorites: vi.fn(),
    onToggleHidden: vi.fn(),
    onClearFilters: vi.fn(),
    count: 5,
    albums: ALBUMS,
    albumId: 'all',
    onAlbumChange: vi.fn(),
    ...over,
  };
  render(<FilterBar {...props} />);
  return props;
}

describe('FilterBar', () => {
  it('tüm çiplerde aria-pressed; filtre yokken "Tümü" basılı', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tümü' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Favoriler' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Gizli olanları göster' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('"Tümü" gizli filtresini de temizler', () => {
    const props = setup({ includeHidden: true });
    const all = screen.getByRole('button', { name: 'Tümü' });
    expect(all).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(all);
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('albüm seçici: akıllı albüm çevrilir, sayılar gösterilir, seçim iletilir', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Albüm' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Tüm fotoğraflar', 'Videolar (12)', 'Tatil (3)']);
    fireEvent.click(screen.getByRole('option', { name: 'Tatil (3)' }));
    expect(props.onAlbumChange).toHaveBeenCalledWith('album:10');
  });
});
