import { useLayoutEffect, useRef, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import type { Conversation } from '@shared/domain';
import { ServicePill } from './ServicePill';
import { formatListTimestamp } from './dateUtils';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (chatId: number) => void;
}

// py-3 (24) + iki metin satırı (22.5 + 2 + 20 ≈ 45) — mevcut satır görseliyle aynı
const ROW_HEIGHT = 69;

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  const Row = ({ index, style }: ListChildComponentProps) => {
    const c = conversations[index]!;
    return (
      <div style={style}>
        <ConversationListItem
          conversation={c}
          selected={c.chatId === selectedId}
          onSelect={() => onSelect(c.chatId)}
        />
      </div>
    );
  };

  return (
    <div ref={containerRef} className="h-full">
      {size.height > 0 && (
        <FixedSizeList
          height={size.height}
          width={size.width}
          itemCount={conversations.length}
          itemSize={ROW_HEIGHT}
          itemKey={(index) => conversations[index]!.chatId}
          overscanCount={8}
        >
          {Row}
        </FixedSizeList>
      )}
    </div>
  );
}

function ConversationListItem({
  conversation: c,
  selected,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-full w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        selected
          ? 'border-l-2 border-accent bg-surface-2'
          : 'border-l-2 border-transparent hover:bg-surface-2'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-text-muted">
        {initials(c.displayName)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-medium text-text">{c.displayName}</span>
          <span className="shrink-0 text-xs tabular-nums text-text-subtle">
            {formatListTimestamp(c.lastMessageDateIso)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
            {c.lastMessagePreview || '—'}
          </span>
          <ServicePill service={c.dominantService} />
        </span>
      </span>
    </button>
  );
}

function initials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  // Numara/handle ise ilk karakter (genelde +)
  if (/^[+\d]/.test(trimmed)) return trimmed.replace(/\D/g, '').slice(-2) || '#';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
