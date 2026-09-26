import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import {
  VariableSizeList,
  type ListChildComponentProps,
  type ListOnItemsRenderedProps,
  type ListOnScrollProps,
} from 'react-window';
import { Check, Star, Play, ImageOff, EyeOff } from 'lucide-react';
import type { PhotoMeta } from '@shared/domain';
import { L } from '../../i18n';
import { buildGridRows, type GridRow } from './gridRows';

const TILE_TARGET = 140;
const GAP = 4;
// Ay başlığı satırı (sanal listede ayrı satır) + üstte sabit (sticky) overlay aynı yükseklik.
export const HEADER_HEIGHT = 36;
// Grid tile ~140px → 160px thumb yeterli (256 fazla). Düşük çözünürlük =
// heic-convert daha hızlı + worker pool yükü düşük. Lightbox ayrı (orig?as=jpeg 4096).
// Cache key size dahil (thumb-160) → eski thumb-256 cache invalidate olmaz, yeni 160 üretilir.
const THUMB_SIZE = 160;

interface RowData {
  rows: GridRow[];
  items: PhotoMeta[];
  columnWidth: number;
  udid: string;
  selected: Set<string>;
  includeHidden: boolean;
  /** Roving tabindex: yalnızca bu öğe Tab sırasında (tabIndex=0). */
  tabbableIndex: number;
  onTileClick: (index: number, e: React.MouseEvent) => void;
  onTileKeyDown: (index: number, e: React.KeyboardEvent<HTMLDivElement>) => void;
  onTileContextMenu: (index: number, e: React.MouseEvent<HTMLDivElement>) => void;
  onOpen: (item: PhotoMeta) => void;
}

function formatDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return '';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

interface TileProps {
  index: number;
  item: PhotoMeta;
  size: number;
  udid: string;
  isSelected: boolean;
  includeHidden: boolean;
  tabbable: boolean;
  data: RowData;
}

// Tile ayrı bileşen: thumbError state'i fileId key'ine bağlı kalsın (satır yeniden
// kullanılsa da öğe başına).
const Tile = memo(function Tile({
  index,
  item,
  size,
  udid,
  isSelected,
  includeHidden,
  tabbable,
  data,
}: TileProps) {
  const [thumbError, setThumbError] = useState(false);
  return (
    <div style={{ width: size, height: size }} className="shrink-0 p-[2px]">
      <div
        role="gridcell"
        aria-selected={isSelected}
        tabIndex={tabbable ? 0 : -1}
        data-photo-index={index}
        onClick={(e) => data.onTileClick(index, e)}
        onDoubleClick={() => data.onOpen(item)}
        onContextMenu={(e) => data.onTileContextMenu(index, e)}
        onKeyDown={(e) => data.onTileKeyDown(index, e)}
        className={`group relative h-full w-full cursor-pointer overflow-hidden rounded-md bg-surface-2 outline-none ${
          isSelected
            ? 'ring-2 ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
            : 'ring-0 hover:ring-2 hover:ring-accent/40 hover:ring-offset-1 hover:ring-offset-bg focus-visible:ring-2 focus-visible:ring-accent/60'
        }`}
      >
        {thumbError ? (
          <div
            role="img"
            aria-label={L.photos.thumbError}
            title={L.photos.thumbError}
            className="flex h-full w-full items-center justify-center"
          >
            <ImageOff className="h-6 w-6 text-text-subtle" strokeWidth={1.5} />
          </div>
        ) : (
          <img
            src={`backup://thumb/${udid}/${item.fileId}?size=${THUMB_SIZE}${item.isVideo ? '&kind=video' : ''}`}
            loading="lazy"
            decoding="async"
            alt={item.filename}
            onError={() => setThumbError(true)}
            className="h-full w-full object-cover"
          />
        )}

        {/* Gizli watermark — sadece gizli filtresi açıkken */}
        {includeHidden && item.isHidden && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <EyeOff className="h-5 w-5 text-white/70 opacity-40" strokeWidth={1.5} />
          </div>
        )}

        {/* Selected check */}
        {isSelected && (
          <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </div>
        )}

        {/* Favori */}
        {item.isFavorite && (
          <Star
            className="absolute bottom-1 right-1 h-3 w-3 fill-current text-amber-500"
            strokeWidth={1.5}
          />
        )}

        {/* Video play + süre */}
        {item.isVideo && (
          <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/60 px-1 py-0.5 text-white">
            <Play className="h-2.5 w-2.5 fill-current" strokeWidth={1.5} />
            {item.durationSec ? (
              <span className="font-mono text-[10px] leading-none">
                {formatDuration(item.durationSec)}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const row = data.rows[index];
  if (!row) return null;
  if (row.type === 'header') {
    return (
      <div style={style} role="row" className="flex items-end px-1 pb-1.5">
        <div role="rowheader" className="text-sm font-semibold text-text">
          {row.label}
        </div>
      </div>
    );
  }
  const tiles: React.ReactNode[] = [];
  for (let i = row.start; i < row.end; i++) {
    const item = data.items[i]!;
    tiles.push(
      <Tile
        key={item.fileId}
        index={i}
        item={item}
        size={data.columnWidth}
        udid={data.udid}
        isSelected={data.selected.has(item.fileId)}
        includeHidden={data.includeHidden}
        tabbable={data.tabbableIndex === i}
        data={data}
      />,
    );
  }
  return (
    <div style={style} role="row" className="flex">
      {tiles}
    </div>
  );
}

// Yüklü öğelerin sonuna bu kadar satır kala sonraki sayfa istenir (prefetch payı).
const LOAD_MORE_ROW_THRESHOLD = 10;
// Klavyeyle açılan context menu'den sonra tarayıcının kendi 'contextmenu' olayı
// (Shift+F10 / Menü tuşu) ikinci kez açmasın diye kısa bastırma penceresi.
const KEYBOARD_MENU_SUPPRESS_MS = 400;

interface PhotoGridProps {
  items: PhotoMeta[];
  udid: string;
  width: number;
  height: number;
  includeHidden: boolean;
  // Seçim state'i parent'ta (PhotosRoute) — seçim çubuğu + Ctrl+A/Esc oradan yönetilir.
  selected: Set<string>;
  onSelectedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  // Sonsuz scroll — sadece YÜKLÜ öğeler render edilir (placeholder hücre yok);
  // sona yaklaşınca sonraki sayfa istenir, satır sayısı büyür.
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onOpen: (item: PhotoMeta) => void;
  onContextMenu: (item: PhotoMeta, x: number, y: number) => void;
}

export function PhotoGrid({
  items,
  udid,
  width,
  height,
  includeHidden,
  selected,
  onSelectedChange,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onOpen,
  onContextMenu,
}: PhotoGridProps) {
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  // Klavye odağı (roving) — seçimden bağımsız.
  const [focusIndex, setFocusIndex] = useState(0);
  // Odak satırı render aralığı dışındaysa Tab ile girilecek görünür ilk öğe.
  const [tabbableIndex, setTabbableIndex] = useState(0);
  // Sticky overlay: görünen ilk satırın bölüm başlığı + scroll > 0 mı.
  const [stickyHeader, setStickyHeader] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const listRef = useRef<VariableSizeList<RowData> | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const scrollTopRef = useRef(0);
  const pendingFocusRef = useRef<number | null>(null);
  const kbMenuAtRef = useRef(0);
  const renderedRangeRef = useRef({ start: 0, stop: -1, visibleStart: 0 });

  // BUG A — yatay scroll: liste DİKEY scrollbar (~12px) render edince içerik alanı
  // daralır; columnCount*columnWidth tüm width'i kaplarsa o ~12px taşar → ALTTA yatay
  // scrollbar çıkar. ÇÖZÜM: genişlik hesabından dikey-scrollbar payını DÜŞ, tile'lar
  // (width - SCROLLBAR)'a otursun → yatay scroll asla çıkmaz, sadece dikey kalır.
  // + liste style'a overflowX:'hidden' (garanti — taşma olsa bile yatay scroll yok).
  const SCROLLBAR = 12;
  const usable = Math.max(TILE_TARGET, width - SCROLLBAR);
  const columnCount = Math.max(1, Math.floor((usable + GAP) / (TILE_TARGET + GAP)));
  const columnWidth = Math.floor(usable / columnCount);

  // Ay bölümleri: başlık satırı + tile satırları (sanal liste satır modeli).
  const layout = useMemo(() => buildGridRows(items, columnCount), [items, columnCount]);
  const { rows, itemRow } = layout;

  // Satır ofsetleri (prefix sum) — scroll-into-view hesabı sticky overlay payıyla
  // bizde yapılır (react-window scrollToItem overlay'i bilmez).
  const offsets = useMemo(() => {
    const out = new Float64Array(rows.length + 1);
    for (let i = 0; i < rows.length; i++) {
      out[i + 1] = out[i]! + (rows[i]!.type === 'header' ? HEADER_HEIGHT : columnWidth);
    }
    return out;
  }, [rows, columnWidth]);

  const itemSize = useCallback(
    (i: number) => (rows[i]?.type === 'header' ? HEADER_HEIGHT : columnWidth),
    [rows, columnWidth],
  );

  // Satır modeli / tile boyu değişince VariableSizeList boy cache'ini sıfırla (boyamadan önce).
  useLayoutEffect(() => {
    listRef.current?.resetAfterIndex(0, true);
  }, [rows, columnWidth]);

  // Öğe listesi küçülünce (filtre/albüm değişimi) odak sınır dışında kalmasın.
  useEffect(() => {
    if (items.length === 0) return;
    setFocusIndex((f) => Math.min(f, items.length - 1));
  }, [items.length]);

  const toggleOne = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      onSelectedChange((prev) => {
        const next = new Set(prev);
        if (next.has(item.fileId)) next.delete(item.fileId);
        else next.add(item.fileId);
        return next;
      });
      setLastIndex(index);
    },
    [items, onSelectedChange],
  );

  const onTileClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const item = items[index];
      if (!item) return;
      setFocusIndex(index);
      if (!e.shiftKey && (e.ctrlKey || e.metaKey)) {
        toggleOne(index);
        return;
      }
      onSelectedChange((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && lastIndex != null) {
          const [a, b] = lastIndex < index ? [lastIndex, index] : [index, lastIndex];
          for (let i = a; i <= b; i++) {
            const it = items[i];
            if (it) next.add(it.fileId);
          }
        } else {
          next.clear();
          next.add(item.fileId);
        }
        return next;
      });
      setLastIndex(index);
    },
    [items, lastIndex, onSelectedChange, toggleOne],
  );

  // Satırı görünür alana getir — üstte sticky overlay (HEADER_HEIGHT) payı bırakılır.
  const ensureRowVisible = useCallback(
    (r: number) => {
      const list = listRef.current;
      if (!list) return;
      const top = offsets[r] ?? 0;
      const bottom = offsets[r + 1] ?? top;
      const st = scrollTopRef.current;
      if (top < st + HEADER_HEIGHT) list.scrollTo(Math.max(0, top - HEADER_HEIGHT));
      else if (bottom > st + height) list.scrollTo(bottom - height);
    },
    [offsets, height],
  );

  // Bekleyen odak: hedef tile sanal listede render edildiyse odakla.
  const flushPendingFocus = useCallback(() => {
    const target = pendingFocusRef.current;
    if (target == null) return;
    const el = outerRef.current?.querySelector<HTMLElement>(`[data-photo-index="${target}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      pendingFocusRef.current = null;
    }
  }, []);

  const moveFocus = useCallback(
    (target: number) => {
      if (target < 0 || target >= items.length) return;
      setFocusIndex(target);
      setTabbableIndex(target);
      pendingFocusRef.current = target;
      ensureRowVisible(itemRow[target] ?? 0);
    },
    [items.length, itemRow, ensureRowVisible],
  );

  useEffect(() => {
    flushPendingFocus();
  }, [focusIndex, rows, flushPendingFocus]);

  // Dikey komşu: bir önceki/sonraki TILE satırı (başlık satırları atlanır), aynı sütun
  // (kısa son satırda son öğeye kıskaçlanır).
  const verticalNeighbor = useCallback(
    (index: number, dir: 1 | -1): number | null => {
      const r = itemRow[index];
      if (r == null) return null;
      const cur = rows[r];
      if (!cur || cur.type !== 'tiles') return null;
      const col = index - cur.start;
      for (let k = r + dir; k >= 0 && k < rows.length; k += dir) {
        const row = rows[k]!;
        if (row.type !== 'tiles') continue;
        return Math.min(row.start + col, row.end - 1);
      }
      return null;
    },
    [rows, itemRow],
  );

  const openMenuAtTile = useCallback(
    (index: number, el: HTMLElement) => {
      const item = items[index];
      if (!item) return;
      const rect = el.getBoundingClientRect();
      kbMenuAtRef.current = Date.now();
      onContextMenu(item, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [items, onContextMenu],
  );

  const onTileContextMenu = useCallback(
    (index: number, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Klavyeyle zaten açıldıysa tarayıcının ardından gelen contextmenu olayını yut.
      if (Date.now() - kbMenuAtRef.current < KEYBOARD_MENU_SUPPRESS_MS) return;
      const item = items[index];
      if (!item) return;
      setFocusIndex(index);
      // Klavye kaynaklı contextmenu (koordinat 0,0) → tile merkezinde aç.
      if (e.clientX === 0 && e.clientY === 0) {
        openMenuAtTile(index, e.currentTarget);
        return;
      }
      onContextMenu(item, e.clientX, e.clientY);
    },
    [items, onContextMenu, openMenuAtTile],
  );

  const onTileKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLDivElement>) => {
      const item = items[index];
      if (!item) return;
      // Shift+F10 / Menü tuşu → context menu tile konumunda.
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        openMenuAtTile(index, e.currentTarget);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+A vb. route'a kalsın
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          onOpen(item);
          break;
        case ' ':
          e.preventDefault();
          toggleOne(index);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus(index - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveFocus(index + 1);
          break;
        case 'ArrowUp': {
          e.preventDefault();
          const t = verticalNeighbor(index, -1);
          if (t != null) moveFocus(t);
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const t = verticalNeighbor(index, 1);
          if (t != null) moveFocus(t);
          break;
        }
        case 'Home':
          e.preventDefault();
          moveFocus(0);
          break;
        case 'End':
          e.preventDefault();
          moveFocus(items.length - 1);
          break;
        default:
          break;
      }
    },
    [items, onOpen, toggleOne, moveFocus, verticalNeighbor, openMenuAtTile],
  );

  // Tab girişi: odak satırı render aralığındaysa o öğe; değilse görünen ilk öğe
  // (sanal listede DOM'da olmayan öğeye tabIndex verilemez).
  const recomputeTabbable = useCallback(() => {
    const { start, stop, visibleStart } = renderedRangeRef.current;
    const fr = itemRow[focusIndex];
    if (fr != null && fr >= start && fr <= stop) {
      setTabbableIndex(focusIndex);
      return;
    }
    for (let k = visibleStart; k < rows.length; k++) {
      const row = rows[k]!;
      if (row.type === 'tiles') {
        setTabbableIndex(row.start);
        return;
      }
    }
  }, [itemRow, focusIndex, rows]);

  useEffect(() => {
    recomputeTabbable();
  }, [recomputeTabbable]);

  // Sonsuz scroll tetikleyici + sticky başlık + bekleyen odak.
  const onItemsRendered = useCallback(
    ({
      overscanStartIndex,
      overscanStopIndex,
      visibleStartIndex,
      visibleStopIndex,
    }: ListOnItemsRenderedProps) => {
      renderedRangeRef.current = {
        start: overscanStartIndex,
        stop: overscanStopIndex,
        visibleStart: visibleStartIndex,
      };
      const first = rows[visibleStartIndex];
      if (first) setStickyHeader(first.type === 'header' ? visibleStartIndex : first.header);
      recomputeTabbable();
      flushPendingFocus();
      if (!hasNextPage || isFetchingNextPage) return;
      if (visibleStopIndex >= rows.length - 1 - LOAD_MORE_ROW_THRESHOLD) onLoadMore();
    },
    [rows, hasNextPage, isFetchingNextPage, onLoadMore, recomputeTabbable, flushPendingFocus],
  );

  const onScroll = useCallback(({ scrollOffset }: ListOnScrollProps) => {
    scrollTopRef.current = scrollOffset;
    setScrolled(scrollOffset > 0);
  }, []);

  const itemData = useMemo<RowData>(
    () => ({
      rows,
      items,
      columnWidth,
      udid,
      selected,
      includeHidden,
      tabbableIndex,
      onTileClick,
      onTileKeyDown,
      onTileContextMenu,
      onOpen,
    }),
    [
      rows,
      items,
      columnWidth,
      udid,
      selected,
      includeHidden,
      tabbableIndex,
      onTileClick,
      onTileKeyDown,
      onTileContextMenu,
      onOpen,
    ],
  );

  const stickyRow = rows[stickyHeader];
  const stickyLabel = stickyRow?.type === 'header' ? stickyRow.label : '';

  return (
    <div
      role="grid"
      aria-label={L.photos.gridAria}
      aria-multiselectable="true"
      className="relative"
      style={{ width, height }}
    >
      <VariableSizeList<RowData>
        ref={listRef}
        outerRef={outerRef}
        itemCount={rows.length}
        itemSize={itemSize}
        estimatedItemSize={columnWidth}
        width={width}
        height={height}
        itemData={itemData}
        onItemsRendered={onItemsRendered}
        onScroll={onScroll}
        // BUG A garanti: yatay scroll ASLA çıkmasın (dikey serbest). Genişlik hesabı
        // scrollbar payını düşüyor; bu overflowX:hidden olası 1px taşmayı da keser.
        style={{ overflowX: 'hidden' }}
        itemKey={(i, data) => {
          const row = data.rows[i];
          if (!row) return `empty-${i}`;
          return row.type === 'header' ? row.key : (data.items[row.start]?.fileId ?? `r-${i}`);
        }}
      >
        {Row}
      </VariableSizeList>

      {/* Sticky ay başlığı — scroll sırasında görünen bölümü gösterir. Scrollbar'ın
          üstüne binmesin diye genişlik usable (width - SCROLLBAR). */}
      {scrolled && stickyLabel && (
        <div
          aria-hidden="true"
          data-testid="photos-sticky-header"
          className="pointer-events-none absolute left-0 top-0 z-[1] flex items-end bg-bg px-1 pb-1.5 text-sm font-semibold text-text"
          style={{ width: usable, height: HEADER_HEIGHT }}
        >
          {stickyLabel}
        </div>
      )}
    </div>
  );
}
