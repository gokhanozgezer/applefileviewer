import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Images, FilterX, Loader2, Maximize2, Download, FolderOpen, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '../../store/uiStore';
import { usePhotos, usePhotoAlbums, ALL_ALBUMS } from '../../hooks/usePhotos';
import { L } from '../../i18n';
import type { PhotoMeta } from '@shared/domain';
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu';
import { RouteError } from '../../components/state/RouteError';
import { EmptyState } from '../../components/state/EmptyState';
import { Skeleton } from '../../components/ui/skeleton';
import { FilterBar } from './FilterBar';
import { PhotoGrid } from './PhotoGrid';
import { Lightbox } from './lightbox/Lightbox';
import { pickByPlatform } from '../../lib/platform';

interface MenuState {
  x: number;
  y: number;
  index: number;
}

// Lightbox'ta sona bu kadar öğe kala sonraki sayfa istenir (ok navigasyonu takılmasın).
const LIGHTBOX_PREFETCH_THRESHOLD = 5;

export function PhotosRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';

  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  // Albüm filtresi (C6) — server-side; 'all' → albüm sınırı yok.
  const [albumId, setAlbumId] = useState<string>(ALL_ALBUMS);

  const enabled = !!udid && !!activeBackup;
  // Filtreler SERVER-SIDE (SQL) — client'ta ikinci kez filtrelenmez.
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePhotos(udid ?? '', rootPath, enabled, favoritesOnly, includeHidden, albumId);
  const albumsQuery = usePhotoAlbums(udid ?? '', rootPath, enabled, includeHidden);
  const albums = albumsQuery.data;

  // Seçili akıllı albüm yeni gizli-filtresi altında boşaldıysa listeden düşer →
  // seçici boş etiket göstermesin, "Tüm fotoğraflar"a dön.
  useEffect(() => {
    if (!albums || albumsQuery.isPlaceholderData || albumId === ALL_ALBUMS) return;
    if (!albums.some((a) => a.id === albumId)) setAlbumId(ALL_ALBUMS);
  }, [albums, albumsQuery.isPlaceholderData, albumId]);

  // Yedek değişince albüm seçimi sıfırlanır (albüm Z_PK'leri yedeğe özgü).
  useEffect(() => {
    setAlbumId(ALL_ALBUMS);
  }, [udid]);

  // Lightbox overlay state (route DEĞİL). null → kapalı. Grid arkada mount kalır,
  // react-window scroll pozisyonu korunur.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Çoklu seçim — grid'deki shift/ctrl mekanizması buradan kontrol edilir
  // (seçim çubuğu + Ctrl+A / Esc bu seviyede).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Container ölçümü → grid width/height.
  // ResizeObserver contentRect ZATEN content-box'tır (px-4/py-3 padding HARİÇ).
  // Bu yüzden grid'e size.width/height DOĞRUDAN geçilir — padding'i ikinci kez
  // çıkarmak (eski `-32`/`-24`) sağ kenarda boşluk şeridi (BUG A, ~133px) yaratıyordu.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sayfaları düzleştir — sadece YÜKLÜ öğeler (placeholder yok).
  const items = useMemo<PhotoMeta[]>(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  // Filtrelenmiş BÜYÜK toplam (server'dan) — FilterBar sayacı ve boş-durum ayrımı.
  const total = data?.pages[0]?.total ?? 0;
  const filterActive = favoritesOnly || includeHidden || albumId !== ALL_ALBUMS;

  // Filtre / yedek değişince eski seçim geçersiz — temizle.
  useEffect(() => {
    setSelected(new Set());
  }, [udid, favoritesOnly, includeHidden, albumId]);

  const onOpen = useCallback(
    (item: PhotoMeta) => {
      const idx = items.findIndex((p) => p.fileId === item.fileId);
      if (idx >= 0) setLightboxIndex(idx);
    },
    [items],
  );

  const onContextMenu = useCallback(
    (item: PhotoMeta, x: number, y: number) => {
      const idx = items.findIndex((p) => p.fileId === item.fileId);
      if (idx >= 0) setMenu({ x, y, index: idx });
    },
    [items],
  );

  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  // Lightbox ok navigasyonu: yüklü öğelerin sonuna yaklaşınca sonraki sayfa
  // (items büyür → hasNext açık kalır, kullanıcı takılmadan gezer).
  const onLightboxNavigate = useCallback(
    (i: number) => {
      setLightboxIndex(i);
      if (hasNextPage && !isFetchingNextPage && i >= items.length - LIGHTBOX_PREFETCH_THRESHOLD) {
        void fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, items.length, fetchNextPage],
  );

  const exportItem = useCallback(
    async (item: PhotoMeta) => {
      try {
        const res = await window.api.export.copyMedia({
          udid: udid ?? '',
          rootPath,
          fileId: item.fileId,
          suggestedName: item.filename,
        });
        if (res.saved) toast.success(`${L.export.saved}: ${res.path}`);
        else if (res.error) toast.error(`${L.export.error}: ${res.error}`);
      } catch (err) {
        toast.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [udid, rootPath],
  );

  // Toplu export — TEK klasör seçimi (main'de dialog), N dosya kopyalanır.
  const exportSelected = useCallback(async () => {
    const chosen = items.filter((p) => selected.has(p.fileId));
    if (chosen.length === 0 || exporting) return;
    setExporting(true);
    try {
      const res = await window.api.export.copyMediaBatch({
        udid: udid ?? '',
        rootPath,
        items: chosen.map((p) => ({ fileId: p.fileId, suggestedName: p.filename })),
      });
      if (res.canceled) return;
      if (res.failed > 0) {
        const detail = res.errors[0] ? ` — ${res.errors[0]}` : '';
        toast.warning(
          `${res.copied} ${L.photos.batchExportedSuffix}, ${res.failed} ${L.photos.batchExportFailedSuffix}${detail}`,
        );
      } else {
        toast.success(`${res.copied} ${L.photos.batchExportedSuffix} → ${res.dir ?? ''}`);
      }
    } catch (err) {
      toast.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }, [items, selected, exporting, udid, rootPath]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Route-lokal klavye: Ctrl+A → tüm YÜKLÜ öğeleri seç; Esc → seçimi temizle.
  // Lightbox / context menu açıkken karışma — onların kendi Esc davranışı var.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightboxIndex != null || menu) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelected(new Set(items.map((p) => p.fileId)));
      } else if (e.key === 'Escape' && selected.size > 0) {
        e.preventDefault();
        setSelected(new Set());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, menu, items, selected.size]);

  const showInFolder = useCallback(
    (item: PhotoMeta) => {
      // relativePath (Media/DCIM/...) iOS backup-içi yol — diskte bu adla yok.
      // Gerçek hash'li dosyayı dosya yöneticisinde (Explorer/Finder/...) göster.
      void window.api.export.showInFolder({ udid: udid ?? '', rootPath, fileId: item.fileId });
    },
    [udid, rootPath],
  );

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu) return [];
    const item = items[menu.index];
    if (!item) return [];
    const list: ContextMenuItem[] = [
      {
        label: L.photos.ctxOpen,
        icon: <Maximize2 className="h-4 w-4" strokeWidth={1.5} />,
        onClick: () => setLightboxIndex(menu.index),
      },
      {
        label: L.photos.ctxExport,
        icon: <Download className="h-4 w-4" strokeWidth={1.5} />,
        onClick: () => void exportItem(item),
      },
      {
        label: pickByPlatform({
          win32: L.photos.ctxShowInFolder,
          darwin: L.photos.ctxShowInFolderMac,
          linux: L.photos.ctxShowInFolderLinux,
        }),
        icon: <FolderOpen className="h-4 w-4" strokeWidth={1.5} />,
        onClick: () => showInFolder(item),
      },
    ];
    // Konum yalnızca asset'te GPS varsa (ZLATITUDE/ZLONGITUDE geçerli) — "enlem, boylam".
    if (item.latitude != null && item.longitude != null) {
      const text = `${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}`;
      list.push({
        label: L.photos.ctxCopyLocation,
        icon: <MapPin className="h-4 w-4" strokeWidth={1.5} />,
        onClick: () => {
          navigator.clipboard
            .writeText(text)
            .then(() => toast.success(L.photos.locationCopied))
            .catch(() => undefined);
        },
      });
    }
    return list;
  }, [menu, items, exportItem, showInFolder]);

  // "Tümü" çipi: favori + gizli kapanır; albüm seçimi korunur (ayrı seçici).
  const clearChipFilters = () => {
    setFavoritesOnly(false);
    setIncludeHidden(false);
  };
  // Boş-filtre durumundaki "Filtreyi temizle": albüm dahil her şey.
  const clearFilter = () => {
    clearChipFilters();
    setAlbumId(ALL_ALBUMS);
  };

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        favoritesOnly={favoritesOnly}
        includeHidden={includeHidden}
        onToggleFavorites={() => setFavoritesOnly((v) => !v)}
        onToggleHidden={() => setIncludeHidden((v) => !v)}
        onClearFilters={clearChipFilters}
        count={total}
        albums={albums}
        albumId={albumId}
        onAlbumChange={setAlbumId}
      />

      <div ref={containerRef} className="relative flex-1 overflow-hidden px-4 py-3">
        {isLoading ? (
          <SkeletonGrid />
        ) : isError ? (
          <RouteError title={L.photos.errorTitle} error={error} onRetry={() => refetch()} />
        ) : total === 0 && filterActive ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <EmptyState icon={FilterX} title={L.photos.filterEmptyTitle} className="" />
            <button
              type="button"
              onClick={clearFilter}
              className="rounded-md bg-surface-2 px-3 py-1.5 text-sm font-medium text-text transition-colors duration-fast hover:bg-surface"
            >
              {L.photos.clearFilter}
            </button>
          </div>
        ) : total === 0 ? (
          <EmptyState icon={Images} title={L.photos.emptyTitle} />
        ) : size.width > 0 && size.height > 0 ? (
          <PhotoGrid
            items={items}
            udid={udid ?? ''}
            width={size.width}
            height={size.height}
            includeHidden={includeHidden}
            selected={selected}
            onSelectedChange={setSelected}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={loadMore}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" strokeWidth={1.5} />
          </div>
        )}

        {/* Sonraki sayfa yüklenirken ince alt gösterge */}
        {isFetchingNextPage && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <div className="flex items-center rounded-full bg-surface-2 px-2 py-1">
              <Loader2 className="h-4 w-4 animate-spin text-text-muted" strokeWidth={1.5} />
            </div>
          </div>
        )}

        {/* Seçim çubuğu — grid container'ın altına sabit */}
        {selected.size > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex h-12 items-center gap-3 border-t border-border bg-surface-2 px-4">
            <span className="text-sm tabular-nums text-text">
              {selected.size} {L.photos.selectedSuffix}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="h-8 cursor-pointer rounded-md px-3 text-sm font-medium text-text-muted transition-colors duration-fast hover:bg-surface"
              >
                {L.photos.clearSelection}
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void exportSelected()}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent/90 disabled:cursor-default disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Download className="h-4 w-4" strokeWidth={1.5} />
                )}
                {L.photos.exportSelected}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox overlay — grid mount KALIR (scroll korunur). */}
      {lightboxIndex != null && (
        <Lightbox
          items={items}
          udid={udid ?? ''}
          rootPath={rootPath}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={onLightboxNavigate}
        />
      )}

      {/* Sağ-tık context menu */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

// Grid iskeleti — ListSkeleton satır düzeni kare tile ızgarasına uymaz; ortak
// ui/Skeleton primitive'i ile ızgara korunur.
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-6 gap-1" aria-busy="true" aria-label={L.photos.loading}>
      {Array.from({ length: 24 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}
