import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Conversation, MessagesThreadResult, ThreadCursor } from '@shared/domain';

/** Sayfa boyutu — düşük donanımda ilk render maliyetini sınırlar. */
export const THREAD_PAGE_SIZE = 300;

export function useConversations(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<Conversation[]>({
    queryKey: ['messages', 'conversations', udid],
    queryFn: () => window.api.messages.conversations({ udid, rootPath }),
    enabled,
  });
}

/**
 * Ters sonsuz sayfalama: ilk sayfa EN YENİ 300 mesaj (ASC), `fetchNextPage`
 * her seferinde bir önceki (daha eski) sayfayı `before` imleciyle çeker.
 * pages[0] = en yeni sayfa; kronolojik ASC düzleştirme için sayfalar TERS
 * sırayla flatMap edilir (bkz. MessagesRoute).
 */
export function useThread(udid: string, rootPath: string, chatId: number | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['messages', 'thread', udid, chatId],
    queryFn: ({ pageParam }): Promise<MessagesThreadResult> =>
      window.api.messages.thread({
        udid,
        rootPath,
        chatId: chatId as number,
        limit: THREAD_PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: null as ThreadCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    enabled: enabled && chatId != null,
  });
}
