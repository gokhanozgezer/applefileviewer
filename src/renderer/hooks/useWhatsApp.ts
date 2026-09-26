import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { WaConversation, WaThreadCursor, WaThreadResult } from '@shared/domain';

/** Sayfa boyutu — Messages ile aynı (düşük donanımda ilk render maliyeti sınırlı). */
export const WA_THREAD_PAGE_SIZE = 300;

export function useWaConversations(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<WaConversation[]>({
    queryKey: ['whatsapp', 'conversations', udid],
    queryFn: () => window.api.whatsapp.conversations({ udid, rootPath }),
    enabled,
  });
}

/**
 * Ters sonsuz sayfalama (useThread ile aynı): ilk sayfa EN YENİ 300 mesaj (ASC),
 * `fetchNextPage` her seferinde daha eski sayfayı `before` imleciyle çeker.
 * pages[0] = en yeni sayfa — kronolojik düzleştirme için `flattenWaPages`.
 */
export function useWaThread(
  udid: string,
  rootPath: string,
  sessionId: number | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ['whatsapp', 'thread', udid, sessionId],
    queryFn: ({ pageParam }): Promise<WaThreadResult> =>
      window.api.whatsapp.thread({
        udid,
        rootPath,
        sessionId: sessionId as number,
        limit: WA_THREAD_PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: null as WaThreadCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    enabled: enabled && sessionId != null,
  });
}

/** Sayfaları (en yeni önce) kronolojik ASC tek listeye çevirir. */
export function flattenWaPages<T>(pages: ReadonlyArray<{ items: T[] }> | undefined): T[] {
  if (!pages || pages.length === 0) return [];
  const out: T[] = [];
  for (let i = pages.length - 1; i >= 0; i--) for (const m of pages[i]!.items) out.push(m);
  return out;
}
