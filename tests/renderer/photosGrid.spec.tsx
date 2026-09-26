import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { PhotoMeta } from '@shared/domain';
import { PhotoGrid } from '@renderer/routes/photos/PhotoGrid';
import { buildGridRows, monthLabel } from '@renderer/routes/photos/gridRows';
import { getActiveLocale, setActiveLocale, type Locale } from '@renderer/i18n';

function photo(i: number, iso: string | null): PhotoMeta {
  return {
    fileId: `f${i}`.padEnd(40, '0'),
    relativePath: `Media/DCIM/IMG_${i}.JPG`,
    filename: `IMG_${i}.JPG`,
    ext: 'JPG',
    isVideo: false,
    dateTakenIso: iso,
    isFavorite: false,
    isHidden: false,
    width: 100,
    height: 100,
    durationSec: null,
    uti: 'public.jpeg',
  };
}

// 6 öğe Eylül 2024 + 2 öğe Ağustos 2024 (DESC sıralı, server gibi).
const ITEMS: PhotoMeta[] = [
  ...Array.from({ length: 6 }, (_, i) =>
    photo(i, `2024-09-${String(20 - i).padStart(2, '0')}T12:00:00`),
  ),
  photo(6, '2024-08-15T12:00:00'),
  photo(7, '2024-08-10T12:00:00'),
];

let prevLocale: Locale;
beforeAll(() => {
  prevLocale = getActiveLocale();
  setActiveLocale('tr');
});
afterAll(() => setActiveLocale(prevLocale));

describe('gridRows — ay bölümleri', () => {
  it('ardışık aynı ay tek bölüm; tile satırları sütun sayısına bölünür', () => {
    const { rows, itemRow } = buildGridRows(ITEMS, 4);
    expect(rows.map((r) => r.type)).toEqual(['header', 'tiles', 'tiles', 'header', 'tiles']);
    expect(rows[2]).toMatchObject({ type: 'tiles', start: 4, end: 6, header: 0 });
    expect(Array.from(itemRow)).toEqual([1, 1, 1, 1, 2, 2, 4, 4]);
  });

  it('etiket dateLocale ile: "Eylül 2024"; tarihsiz → "Tarihsiz"', () => {
    expect(monthLabel('2024-09-20T12:00:00')).toBe('Eylül 2024');
    expect(monthLabel(null)).toBe('Tarihsiz');
    setActiveLocale('en');
    expect(monthLabel('2024-09-20T12:00:00')).toBe('September 2024');
    setActiveLocale('tr');
  });
});

function Harness(props: {
  onOpen?: (p: PhotoMeta) => void;
  onContextMenu?: (p: PhotoMeta, x: number, y: number) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <PhotoGrid
      items={ITEMS}
      udid="u"
      // usable = 588 → 4 sütun × 147px
      width={600}
      height={800}
      includeHidden={false}
      selected={selected}
      onSelectedChange={setSelected}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      onOpen={props.onOpen ?? (() => undefined)}
      onContextMenu={props.onContextMenu ?? (() => undefined)}
    />
  );
}

function cell(i: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-photo-index="${i}"]`);
  if (!el) throw new Error(`cell ${i} yok`);
  return el;
}

describe('PhotoGrid — başlıklar + erişilebilirlik', () => {
  it('ay başlık satırları sanal liste içinde render edilir', () => {
    render(<Harness />);
    const grid = screen.getByRole('grid');
    const headers = within(grid)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Eylül 2024', 'Ağustos 2024']);
  });

  it('roving tabindex: tek tabbable hücre; oklar bölüm sınırında sütunu korur', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('gridcell');
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);

    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1));
    fireEvent.keyDown(cell(1), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(5));
    // Başlık satırı atlanır, sonraki bölümde aynı sütun (1) → öğe 7
    fireEvent.keyDown(cell(5), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(7));
    fireEvent.keyDown(cell(7), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell(5));
    fireEvent.keyDown(cell(5), { key: 'Home' });
    expect(document.activeElement).toBe(cell(0));
    expect(cell(0).tabIndex).toBe(0);
    expect(cell(5).tabIndex).toBe(-1);
  });

  it('Space seçimi aç/kapat (aria-selected), Enter açar', () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    expect(cell(2)).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(cell(2), { key: ' ' });
    expect(cell(2)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(cell(3), { key: ' ' });
    expect(cell(2)).toHaveAttribute('aria-selected', 'true');
    expect(cell(3)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(cell(2), { key: ' ' });
    expect(cell(2)).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(cell(4), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(ITEMS[4]);
  });

  it('Shift+F10 ve Menü tuşu context menu açar; ardından gelen contextmenu olayı yutulur', () => {
    const onContextMenu = vi.fn();
    render(<Harness onContextMenu={onContextMenu} />);
    fireEvent.keyDown(cell(1), { key: 'F10', shiftKey: true });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0]![0]).toBe(ITEMS[1]);
    // Tarayıcının klavye kaynaklı contextmenu'su ikinci kez açmamalı
    fireEvent.contextMenu(cell(1));
    expect(onContextMenu).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(cell(2), { key: 'ContextMenu' });
    expect(onContextMenu).toHaveBeenCalledTimes(2);
  });
});
