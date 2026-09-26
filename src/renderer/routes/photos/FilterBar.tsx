import { useMemo } from 'react';
import type { PhotoAlbum, PhotoSmartAlbumKey } from '@shared/domain';
import { L } from '../../i18n';
import { collator } from '../../i18n/dateLocale';
import { Select, type SelectOption } from '../../components/ui/select';
import { ALL_ALBUMS } from '../../hooks/usePhotos';

interface FilterBarProps {
  favoritesOnly: boolean;
  includeHidden: boolean;
  onToggleFavorites: () => void;
  onToggleHidden: () => void;
  /** "Tümü" — favori + gizli filtrelerini birlikte kapatır (albüm seçimi korunur). */
  onClearFilters: () => void;
  count: number;
  /** Albüm seçici — undefined iken (yükleniyor / hata) seçici yalnızca "Tüm fotoğraflar". */
  albums: PhotoAlbum[] | undefined;
  albumId: string;
  onAlbumChange: (albumId: string) => void;
}

function chipClass(active: boolean): string {
  const base =
    'h-7 rounded-md px-3 text-[13px] font-medium transition-colors duration-fast cursor-pointer';
  return active
    ? `${base} bg-accent/10 text-accent ring-1 ring-accent/40`
    : `${base} text-text-muted hover:bg-surface-2`;
}

export function smartAlbumTitle(key: PhotoSmartAlbumKey): string {
  switch (key) {
    case 'videos':
      return L.photos.smartVideos;
    case 'screenshots':
      return L.photos.smartScreenshots;
    case 'selfies':
      return L.photos.smartSelfies;
    case 'livePhotos':
      return L.photos.smartLivePhotos;
    case 'panoramas':
      return L.photos.smartPanoramas;
    case 'recentlyDeleted':
      return L.photos.smartRecentlyDeleted;
  }
}

export function albumOptions(albums: PhotoAlbum[] | undefined): SelectOption[] {
  const nf = new Intl.NumberFormat(collator());
  const opts: SelectOption[] = [{ value: ALL_ALBUMS, label: L.photos.albumAll }];
  for (const a of albums ?? []) {
    const title = a.kind === 'smart' && a.smartKey ? smartAlbumTitle(a.smartKey) : (a.title ?? '');
    opts.push({ value: a.id, label: `${title} (${nf.format(a.count)})` });
  }
  return opts;
}

export function FilterBar({
  favoritesOnly,
  includeHidden,
  onToggleFavorites,
  onToggleHidden,
  onClearFilters,
  count,
  albums,
  albumId,
  onAlbumChange,
}: FilterBarProps) {
  const allActive = !favoritesOnly && !includeHidden;
  const options = useMemo(() => albumOptions(albums), [albums]);

  return (
    <div className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-surface/95 px-6 backdrop-blur-sm">
      <h1 className="text-lg font-medium text-text">{L.photos.title}</h1>
      <span className="text-xs tabular-nums text-text-subtle">
        {count} {L.photos.countSuffix}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Select
          value={albumId}
          options={options}
          onChange={onAlbumChange}
          aria-label={L.photos.albumPickerAria}
          className="mr-2 w-52"
        />
        <button
          type="button"
          aria-pressed={allActive}
          className={chipClass(allActive)}
          onClick={() => {
            if (!allActive) onClearFilters();
          }}
        >
          {L.photos.filterAll}
        </button>
        <button
          type="button"
          aria-pressed={favoritesOnly}
          className={chipClass(favoritesOnly)}
          onClick={onToggleFavorites}
        >
          {L.photos.filterFavorites}
        </button>
        <button
          type="button"
          aria-pressed={includeHidden}
          className={chipClass(includeHidden)}
          onClick={onToggleHidden}
        >
          {L.photos.filterHidden}
        </button>
      </div>
    </div>
  );
}
