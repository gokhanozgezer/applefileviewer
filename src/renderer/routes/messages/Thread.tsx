import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { VariableSizeList, type ListChildComponentProps } from 'react-window';
import type { Conversation, Message } from '@shared/domain';
import { ExportMenu } from '../../components/ExportMenu';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { ServicePill } from './ServicePill';
import { ServiceDivider } from './ServiceDivider';
import { MessageBubble } from './MessageBubble';
import { formatDateDivider, dayKey } from './dateUtils';

export type ThreadExportFormat = 'html' | 'pdf' | 'json';

interface ThreadProps {
  conversation: Conversation;
  messages: Message[];
  loading: boolean;
  /** İlk sayfa yüklenemediyse hata — boş sohbet yerine hata + yeniden dene gösterilir. */
  error?: unknown;
  onRetry?: () => void;
  udid: string;
  onExport: (format: ThreadExportFormat) => void;
  /** Daha eski (yüklenmemiş) sayfa var mı? */
  hasOlder: boolean;
  /** Eski sayfa şu an çekiliyor mu? */
  loadingOlder: boolean;
  /** Yukarı kaydırınca eski sayfayı yükle. */
  onLoadOlder: () => void;
}

type RenderItem =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'service'; key: string; from: Message['service']; to: Message['service'] }
  | { kind: 'message'; key: string; message: Message };

const DATE_ROW_HEIGHT = 36;
const SERVICE_ROW_HEIGHT = 40; // my-3 (24) + içerik (~16)
const ROW_GAP = 6; // mesajlar arası boşluk
const BUBBLE_VPAD = 16; // px-3 py-2 dikey toplam
const LINE_HEIGHT = 22; // 15px * 1.45
const MEDIA_HEIGHT = 240; // foto/video önizleme tahmini (max-h-80 sınırı içinde)
const AUDIO_HEIGHT = 54;
const FILE_HEIGHT = 40; // dosya kartı / eksik ek satırı
/** Eski sayfa yüklemesini tetikleyen üst eşik (görünür ilk index). */
const LOAD_OLDER_THRESHOLD = 10;

/** Bir satırın tahmini yüksekliği — WaThread ile aynı yaklaşım. */
function estimateHeight(item: RenderItem, bubbleWidth: number): number {
  if (item.kind === 'date') return DATE_ROW_HEIGHT;
  if (item.kind === 'service') return SERVICE_ROW_HEIGHT;
  const m = item.message;
  let h = ROW_GAP;
  for (const att of m.attachments) {
    if (att.fileId && (att.kind === 'image' || att.kind === 'video')) h += MEDIA_HEIGHT;
    else if (att.fileId && att.kind === 'audio') h += AUDIO_HEIGHT;
    else h += FILE_HEIGHT;
    h += 4; // gap-1
  }
  const text = (m.text ?? '').trim();
  if (text.length > 0) {
    // ~ 8px/karakter ort. → satır başına karakter; min 1 satır
    const charsPerLine = Math.max(8, Math.floor(bubbleWidth / 8));
    const explicitLines = text.split('\n').length;
    const wrapLines = Math.ceil(text.length / charsPerLine);
    const lines = Math.max(explicitLines, wrapLines, 1);
    h += lines * LINE_HEIGHT + BUBBLE_VPAD;
  }
  return Math.max(h, 28);
}

export function Thread({
  conversation,
  messages,
  loading,
  error,
  onRetry,
  udid,
  onExport,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: ThreadProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<VariableSizeList | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const services = useMemo(() => {
    const set = new Set(messages.map((m) => m.service));
    return Array.from(set);
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.text ?? '').toLowerCase().includes(q));
  }, [messages, query]);

  const items = useMemo<RenderItem[]>(() => {
    const out: RenderItem[] = [];
    let prevDay = '';
    let prevService: Message['service'] | null = null;
    for (const m of visibleMessages) {
      const dk = dayKey(m.dateIso);
      if (dk && dk !== prevDay) {
        out.push({ kind: 'date', key: `d-${dk}`, label: formatDateDivider(m.dateIso) });
        prevDay = dk;
        // Yeni güne geçişte service divider sıfırla — gün ayracı zaten ayırıyor
        prevService = null;
      }
      if (prevService && prevService !== m.service) {
        out.push({
          kind: 'service',
          key: `s-${m.rowId}`,
          from: prevService,
          to: m.service,
        });
      }
      out.push({ kind: 'message', key: `m-${m.rowId}`, message: m });
      prevService = m.service;
    }
    return out;
  }, [visibleMessages]);

  // Container boyutunu ResizeObserver ile ölç (AutoSizer dependency yok)
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bubbleWidth = Math.min(540, Math.floor(size.width * 0.7));

  const heights = useMemo(
    () => items.map((it) => estimateHeight(it, bubbleWidth)),
    [items, bubbleWidth],
  );

  // Scroll durumu — ters sonsuz kaydırma için ref'ler
  const scrollOffsetRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const requestedForFirstKeyRef = useRef<string | null>(null);
  const prevRef = useRef<{
    chatId: number | null;
    firstRowId: number | null;
    /** İlk mesajın liste başından piksel uzaklığı (üstündeki divider'lar dahil). */
    firstMsgTop: number;
    query: string;
  }>({ chatId: null, firstRowId: null, firstMsgTop: 0, query: '' });

  // items/genişlik değişince react-window yükseklik cache'ini sıfırla,
  // ardından scroll konumunu yönet (aynı layout-effect sırası kritik).
  useLayoutEffect(() => {
    listRef.current?.resetAfterIndex(0, false);
  }, [heights]);

  useLayoutEffect(() => {
    const prev = prevRef.current;
    const firstRowId = messages.length > 0 ? messages[0]!.rowId : null;
    const anchorKey = firstRowId != null ? `m-${firstRowId}` : null;
    const anchorIdx = anchorKey ? items.findIndex((it) => it.key === anchorKey) : -1;
    let firstMsgTop = 0;
    for (let i = 0; i < anchorIdx; i++) firstMsgTop += heights[i] ?? 0;

    const convChanged = conversation.chatId !== prev.chatId;
    const queryChanged = query !== prev.query;

    if (convChanged) {
      didInitialScrollRef.current = false;
      requestedForFirstKeyRef.current = null;
    }

    if (convChanged || queryChanged || prev.firstRowId == null) {
      // Yeni sohbet / arama değişimi / ilk veri → en alta (en yeni mesaj)
      if (items.length > 0 && !query.trim()) {
        listRef.current?.scrollToItem(items.length - 1, 'end');
        didInitialScrollRef.current = true;
      }
    } else if (firstRowId != null && firstRowId !== prev.firstRowId && !query.trim()) {
      // Eski sayfa BAŞA eklendi → görsel scroll konumunu koru:
      // eski ilk mesajın (anchor) yeni konumu ile eski konumu arasındaki
      // yükseklik farkı kadar scrollOffset kaydırılır.
      const prevAnchorIdx = items.findIndex((it) => it.key === `m-${prev.firstRowId}`);
      if (prevAnchorIdx > 0) {
        let newTop = 0;
        for (let i = 0; i < prevAnchorIdx; i++) newTop += heights[i] ?? 0;
        const delta = newTop - prev.firstMsgTop;
        if (delta > 0) listRef.current?.scrollTo(scrollOffsetRef.current + delta);
      }
    }

    prevRef.current = { chatId: conversation.chatId, firstRowId, firstMsgTop, query };
  }, [items, heights, messages, conversation.chatId, query]);

  const getItemSize = (index: number) => heights[index] ?? DATE_ROW_HEIGHT;

  // Kullanıcı üste yaklaşınca eski sayfayı çek — sayfa başına bir kez
  // (requestedForFirstKey guard'ı prepend sonrası otomatik yeniden kurulur).
  const handleItemsRendered = ({ visibleStartIndex }: { visibleStartIndex: number }) => {
    if (!didInitialScrollRef.current) return;
    if (query.trim()) return;
    if (visibleStartIndex >= LOAD_OLDER_THRESHOLD) return;
    if (!hasOlder || loadingOlder) return;
    const firstKey = items[0]?.key ?? null;
    if (!firstKey || requestedForFirstKeyRef.current === firstKey) return;
    requestedForFirstKeyRef.current = firstKey;
    onLoadOlder();
  };

  const Row = ({ index, style }: ListChildComponentProps) => {
    const it = items[index]!;
    if (it.kind === 'date') {
      return (
        <div style={style} className="flex items-center justify-center">
          <span className="text-center text-xs tabular-nums text-text-muted">{it.label}</span>
        </div>
      );
    }
    if (it.kind === 'service') {
      return (
        <div style={style} className="px-4">
          <ServiceDivider from={it.from} to={it.to} />
        </div>
      );
    }
    return (
      <div style={style} className="px-4">
        <MessageBubble message={it.message} udid={udid} />
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span
                className="truncate text-[15px] font-medium text-text"
                title={conversation.displayName}
              >
                {conversation.displayName}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {services.includes('iMessage') && <ServicePill service="iMessage" />}
                {services.includes('SMS') && <ServicePill service="SMS" />}
              </div>
            </div>
            {conversation.contactName && conversation.identifier && (
              <span className="truncate font-mono text-xs text-text-muted">
                {conversation.identifier}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={L.messages.searchAria}
              title={L.messages.searchAria}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Search className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <ExportMenu<ThreadExportFormat>
              options={[
                { value: 'html', label: L.exportMenu.asHtml },
                { value: 'pdf', label: L.exportMenu.asPdf },
                { value: 'json', label: L.exportMenu.asJson },
              ]}
              onSelect={onExport}
              aria-label={L.messages.exportAria}
            />
          </div>
        </div>

        {searchOpen && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
                strokeWidth={1.5}
              />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery('');
                    setSearchOpen(false);
                  }
                }}
                placeholder={L.messages.threadSearchPlaceholder}
                aria-label={L.messages.searchAria}
                className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            <button
              type="button"
              aria-label={L.messages.closeSearchAria}
              title={L.messages.closeSearchAria}
              onClick={() => {
                setQuery('');
                setSearchOpen(false);
              }}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </header>

      {/* Mesaj listesi — react-window VariableSizeList (büyük sohbetler virtualize) */}
      <div ref={containerRef} className="relative min-h-0 flex-1 py-3">
        {loadingOlder && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 py-1.5 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            <span className="text-xs">{L.messages.loadingOlder}</span>
          </div>
        )}
        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="flex h-full items-center justify-center gap-2 text-text-muted"
          >
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-sm">{L.messages.threadLoading}</span>
          </div>
        ) : error !== undefined && messages.length === 0 ? (
          // Önceden hata "boş sohbet" olarak görünüyordu.
          <RouteError
            title={L.messages.threadErrorTitle}
            error={error}
            onRetry={() => onRetry?.()}
          />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">{L.messages.emptyThreadTitle}</p>
          </div>
        ) : query.trim() && visibleMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">
              {L.messages.searchNoResultPrefix}
              {`"${query.trim()}"`}
              {L.messages.searchNoResultSuffix}
            </p>
          </div>
        ) : size.height > 0 ? (
          <VariableSizeList
            ref={listRef}
            height={size.height}
            width={size.width}
            itemCount={items.length}
            itemSize={getItemSize}
            itemKey={(index) => items[index]!.key}
            estimatedItemSize={64}
            overscanCount={6}
            onScroll={({ scrollOffset }) => {
              scrollOffsetRef.current = scrollOffset;
            }}
            onItemsRendered={handleItemsRendered}
          >
            {Row}
          </VariableSizeList>
        ) : null}
      </div>
    </div>
  );
}
