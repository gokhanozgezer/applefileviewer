import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MessageSquare, MessageSquareOff } from 'lucide-react';
import type { Message } from '@shared/domain';
import { useUIStore } from '../../store/uiStore';
import { useConversations, useThread } from '../../hooks/useMessages';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { EmptyState } from '../../components/state/EmptyState';
import { ListSkeleton } from '../../components/state/ListSkeleton';
import { notify } from '../../components/ui/toast';
import { ConversationList } from './ConversationList';
import { Thread, type ThreadExportFormat } from './Thread';

export function MessagesRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';
  const enabled = !!udid && !!activeBackup;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  // Global arama derin bağlantısı: ?chat=<chatId> → sohbeti seç, parametreyi
  // temizle (replace) — geri gelindiğinde yapışkan yeniden-seçim olmasın.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const chat = searchParams.get('chat');
    if (chat === null) return;
    const id = Number(chat);
    if (Number.isFinite(id)) setSelectedId(id);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch,
  } = useConversations(udid ?? '', rootPath, enabled);

  const thread = useThread(udid ?? '', rootPath, selectedId, enabled);

  // Sayfaları kronolojik ASC düzleştir — pages[0] en yeni sayfa olduğundan
  // eski sayfalar başa gelecek şekilde TERS sırayla birleştirilir.
  const threadMessages = useMemo<Message[]>(() => {
    const pages = thread.data?.pages;
    if (!pages || pages.length === 0) return [];
    const out: Message[] = [];
    for (let i = pages.length - 1; i >= 0; i--) {
      for (const m of pages[i]!.items) out.push(m);
    }
    return out;
  }, [thread.data]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = thread;
  const onLoadOlder = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const selectedConversation = useMemo(
    () => conversations?.find((c) => c.chatId === selectedId) ?? null,
    [conversations, selectedId],
  );

  const filteredConversations = useMemo(() => {
    const list = conversations ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.identifier.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const onExport = async (format: ThreadExportFormat) => {
    if (!selectedConversation || threadMessages.length === 0) return;
    const name =
      selectedConversation.contactName ||
      selectedConversation.displayName ||
      selectedConversation.identifier;
    try {
      const res = await window.api.export.save({
        kind: 'messageThread',
        format,
        // Tam sohbet main'de okunur (yalnız yüklenmiş sayfalar değil).
        payload: {
          udid: udid ?? '',
          rootPath,
          chatId: selectedConversation.chatId,
          conversation: selectedConversation,
        },
        suggestedName: name,
      });
      if (res.saved) notify.success(`${L.export.saved}: ${res.path}`);
      else if (res.error) notify.error(`${L.export.error}: ${res.error}`);
    } catch (err) {
      notify.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
        <div className="shrink-0 border-b border-border px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L.messages.searchPlaceholder}
            aria-label={L.messages.listSearchAria}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <ListSkeleton label={L.messages.loading} />
          ) : isError ? (
            <RouteError
              title={L.messages.listErrorTitle}
              error={error}
              onRetry={() => refetch()}
              compact
            />
          ) : (conversations?.length ?? 0) === 0 ? (
            <EmptyState icon={MessageSquareOff} title={L.messages.emptyListTitle} compact />
          ) : (
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      {/* Content panel */}
      {selectedConversation ? (
        <Thread
          conversation={selectedConversation}
          messages={threadMessages}
          loading={thread.isLoading}
          error={thread.isError && threadMessages.length === 0 ? thread.error : undefined}
          onRetry={() => void thread.refetch()}
          udid={udid ?? ''}
          onExport={onExport}
          hasOlder={thread.hasNextPage}
          loadingOlder={thread.isFetchingNextPage}
          onLoadOlder={onLoadOlder}
        />
      ) : (
        <EmptyState
          icon={MessageSquare}
          title={L.messages.noSelectionTitle}
          description={L.messages.noSelectionHint}
          className="flex-1"
        />
      )}
    </div>
  );
}
