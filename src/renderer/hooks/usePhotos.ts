import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { PhotoAlbum, PhotosResult } from '@shared/domain';

// Sayfa boyutu: ilk boyama hızlı (düşük donanım hedefi), IPC payload küçük.
export const PHOTOS_PAGE_SIZE = 500;

/** Albüm seçicide "albüm yok" değeri — server'a albumId gönderilmez. */
export const ALL_ALBUMS = 'all';

export function usePhotos(
  udid: string,
  rootPath: string,
  enabled: boolean,
  favoritesOnly: boolean,
  includeHidden: boolean,
  albumId: string = ALL_ALBUMS,
) {
  return useInfiniteQuery({
    // Filtreler queryKey'de — değişince cache ayrışır, sayfalar sıfırdan gelir.
    queryKey: ['photos', udid, favoritesOnly, includeHidden, albumId] as const,
    queryFn: ({ pageParam }): Promise<PhotosResult> =>
      window.api.photos.list({
        udid,
        rootPath,
        offset: pageParam,
        limit: PHOTOS_PAGE_SIZE,
        favoritesOnly,
        includeHidden,
        albumId: albumId === ALL_ALBUMS ? undefined : albumId,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
    enabled,
  });
}

/** Albüm listesi (akıllı + kullanıcı) — sayılar gizli-filtresine göre server'da hesaplanır. */
export function usePhotoAlbums(
  udid: string,
  rootPath: string,
  enabled: boolean,
  includeHidden: boolean,
) {
  return useQuery({
    queryKey: ['photoAlbums', udid, includeHidden] as const,
    queryFn: (): Promise<PhotoAlbum[]> =>
      window.api.photos.albums({ udid, rootPath, includeHidden }),
    enabled,
    // Albümler oturum içinde değişmez (salt-okunur yedek).
    staleTime: Infinity,
    // Gizli-filtresi değişince seçici boşalıp titremesin — yeni sayılar gelene kadar eskiler.
    placeholderData: (prev) => prev,
  });
}
