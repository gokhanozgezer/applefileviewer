import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MessageCircle, MessageCircleOff } from 'lucide-react';
import { runExportSave } from '../../components/ExportMenu';
import { useUIStore } from '../../store/uiStore';
import { flattenWaPages, useWaConversations, useWaThread } from '../../hooks/useWhatsApp';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { EmptyState } from '../../components/state/EmptyState';
import { ListSkeleton } from '../../components/state/ListSkeleton';
import { WaConversationList } from './WaConversationList';
import { WaThread, type WaThreadExportFormat } from './WaThread';

export function WhatsAppRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';
  const enabled = !!udid && !!activeBackup;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  // Global arama derin bağlantısı: ?session=<sessionId> → sohbeti seç,
  // parametreyi temizle (replace) — yapışkan yeniden-seçim olmasın.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const session = searchParams.get('session');
    if (session === null) return;
    const id = Number(session);
    if (Number.isFinite(id)) setSelectedId(id);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch,
  } = useWaConversations(udid ?? '', rootPath, enabled);

  const thread = useWaThread(udid ?? '', rootPath, selectedId, enabled);

  // Sayfaları kronolojik ASC düzleştir — pages[0] en yeni sayfa (bkz. useWaThread).
  const threadMessages = useMemo(() => flattenWaPages(thread.data?.pages), [thread.data]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = thread;
  const onLoadOlder = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const selectedConversation = useMemo(
    () => conversations?.find((c) => c.sessionId === selectedId) ?? null,
    [conversations, selectedId],
  );

  const filteredConversations = useMemo(() => {
    const list = conversations ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.contactJid.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const onExport = (format: WaThreadExportFormat) => {
    if (!selectedConversation || !udid) return;
    const name =
      selectedConversation.contactName ||
      selectedConversation.displayName ||
      selectedConversation.contactJid;
    // Tam sohbet main'de sayfa sayfa okunur (renderer yalnız yüklenmiş sayfaları tutar).
    void runExportSave({
      kind: 'waThread',
      format,
      payload: {
        udid,
        rootPath,
        sessionId: selectedConversation.sessionId,
        conversation: selectedConversation,
      },
      suggestedName: name,
    });
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
            placeholder={L.whatsapp.searchPlaceholder}
            aria-label={L.whatsapp.listSearchAria}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-wa-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <ListSkeleton />
          ) : isError ? (
            <RouteError
              title={L.whatsapp.listErrorTitle}
              error={error}
              onRetry={() => refetch()}
              compact
              accent="wa"
            />
          ) : (conversations?.length ?? 0) === 0 ? (
            <EmptyState icon={MessageCircleOff} title={L.whatsapp.emptyListTitle} compact />
          ) : (
            <WaConversationList
              conversations={filteredConversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      {/* Content panel */}
      {selectedConversation ? (
        <WaThread
          conversation={selectedConversation}
          messages={threadMessages}
          loading={thread.isLoading}
          // İlk sayfa hatası → RouteError; eski-sayfa hatasında yüklü mesajlar korunur.
          error={thread.isError && !thread.data ? thread.error : null}
          onRetry={() => void thread.refetch()}
          udid={udid ?? ''}
          onExport={onExport}
          hasOlder={thread.hasNextPage}
          loadingOlder={thread.isFetchingNextPage}
          onLoadOlder={onLoadOlder}
        />
      ) : (
        <EmptyState
          icon={MessageCircle}
          title={L.whatsapp.noSelectionTitle}
          description={L.whatsapp.noSelectionHint}
          className="flex-1"
        />
      )}
    </div>
  );
}
