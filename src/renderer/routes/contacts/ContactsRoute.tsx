import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VariableSizeList, type ListChildComponentProps } from 'react-window';
import { Users, Search, SearchX, Download, UserRound } from 'lucide-react';
import type { Contact } from '@shared/domain';
import { useUIStore } from '../../store/uiStore';
import { useContacts } from '../../hooks/useContacts';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { notify } from '../../components/ui/toast';
import { EmptyState } from '../../components/state/EmptyState';
import { ContactListItem } from './ContactListItem';
import { ContactDetail } from './ContactDetail';
import { getSectionLetter } from './initials';

function normalize(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

// B5 — sanal liste. A-Z bölüm başlıkları satır listesine DÜZLEŞTİRİLİR
// ({type:'header'|'row'}) → VariableSizeList tek listeyle her ikisini çizer.
// Kişi satırı: py-2 + avatar h-9 = 52px; başlık: pt-2 + pb-1 + text-[11px] ≈ 28px.
// Eski space-y-0.5 boşluğu (2px) itemSize'a eklenir, öğeden düşülür.
const CONTACT_ROW = 52;
const HEADER_ROW = 28;
const ROW_GAP = 2;
// Sarmalayıcının p-2 dikey padding'i (8+8).
const WRAP_PY = 16;

type ListItem = { type: 'header'; letter: string } | { type: 'row'; contact: Contact };

// Konteyner ölçümü — PhotosRoute'taki ResizeObserver deseni (callback-ref).
function useElementSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);
  return { ref, size };
}

const InnerUl = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(
  function InnerUl(props, ref) {
    return <ul ref={ref} {...props} />;
  },
);

interface RowData {
  items: ListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const item = data.items[index]!;
  const rowStyle = { ...style, height: (style.height as number) - ROW_GAP };
  if (item.type === 'header') {
    return (
      <li
        style={rowStyle}
        className="block px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle"
      >
        {item.letter}
      </li>
    );
  }
  return (
    <ContactListItem
      contact={item.contact}
      selected={data.selectedId === item.contact.id}
      onSelect={data.onSelect}
      style={rowStyle}
    />
  );
}

export function ContactsRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';
  const enabled = !!udid && !!activeBackup;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  // Global arama derin bağlantısı: ?contact=<contactId> → kişiyi seç,
  // parametreyi temizle (replace). Arama filtresi sıfırlanır ki hedef görünsün.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const contact = searchParams.get('contact');
    if (contact === null) return;
    const id = Number(contact);
    if (Number.isFinite(id)) {
      setQuery('');
      setSelectedId(id);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const { ref: listPanelRef, size } = useElementSize();
  const listRef = useRef<VariableSizeList<RowData> | null>(null);

  const {
    data: contacts,
    isLoading,
    isError,
    error,
    refetch,
  } = useContacts(udid ?? '', rootPath, enabled);

  const visible = useMemo(() => {
    if (!contacts) return [];
    const q = normalize(query);
    if (!q) return contacts;
    const digits = q.replace(/\D/g, '');
    return contacts.filter((c) => {
      if (normalize(c.displayName).includes(q)) return true;
      if (digits && c.phones.some((p) => p.replace(/\D/g, '').includes(digits))) return true;
      if (c.emails.some((e) => normalize(e).includes(q))) return true;
      if (c.organization && normalize(c.organization).includes(q)) return true;
      return false;
    });
  }, [contacts, query]);

  // Bölüm başlıkları + kişiler tek düz listede (sanal liste indexlenebilsin).
  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let prevLetter: string | null = null;
    for (const c of visible) {
      const letter = getSectionLetter(c.displayName);
      if (letter !== prevLetter) {
        out.push({ type: 'header', letter });
        prevLetter = letter;
      }
      out.push({ type: 'row', contact: c });
    }
    return out;
  }, [visible]);

  // Filtre değişince index→yükseklik cache'i geçersiz (header konumları kayar).
  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [items]);

  const selected = useMemo(
    () => visible.find((c) => c.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const rowData = useMemo<RowData>(
    () => ({ items, selectedId: selected?.id ?? null, onSelect: setSelectedId }),
    [items, selected],
  );

  const itemSize = useCallback(
    (index: number) => (items[index]!.type === 'header' ? HEADER_ROW : CONTACT_ROW) + ROW_GAP,
    [items],
  );

  const onExport = async () => {
    if (visible.length === 0) return;
    try {
      const res = await window.api.export.save({
        kind: 'contacts',
        format: 'vcard',
        payload: visible,
        suggestedName: 'kisiler',
      });
      if (res.saved) notify.success(`${L.export.saved}: ${res.path}`);
      else if (res.error) notify.error(`${L.export.error}: ${res.error}`);
    } catch (err) {
      notify.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (isLoading) return <ListSkeleton />;

  if (isError) {
    return <RouteError title={L.contacts.errorTitle} error={error} onRetry={() => refetch()} />;
  }

  if ((contacts?.length ?? 0) === 0) {
    return <EmptyState icon={Users} title={L.contacts.emptyTitle} />;
  }

  return (
    <div className="flex h-full">
      {/* Liste paneli — 320px */}
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h1 className="text-base font-semibold text-text">{L.contacts.title}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-text-muted">
              {visible.length} {L.contacts.countSuffix}
            </span>
            <button
              type="button"
              onClick={onExport}
              disabled={visible.length === 0}
              aria-label={L.export.contactsAria}
              title={L.export.contactsAria}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
              }}
              placeholder={L.contacts.searchPlaceholder}
              aria-label={L.contacts.searchAria}
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-7 pr-2 text-xs text-text outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={SearchX} title={L.contacts.searchEmpty} compact className="flex-1" />
        ) : (
          <div ref={listPanelRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="h-full p-2">
              <VariableSizeList<RowData>
                ref={listRef}
                height={Math.max(0, size.height - WRAP_PY)}
                width="100%"
                itemCount={items.length}
                itemSize={itemSize}
                estimatedItemSize={CONTACT_ROW + ROW_GAP}
                itemData={rowData}
                innerElementType={InnerUl}
                overscanCount={8}
              >
                {Row}
              </VariableSizeList>
            </div>
          </div>
        )}
      </div>

      {/* Detay paneli */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <ContactDetail contact={selected} />
        ) : (
          <EmptyState icon={UserRound} title={L.contacts.selectPrompt} />
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  // Ortak ListSkeleton ile aynı a11y sözleşmesi: role=status + aria-busy + sr-only metin.
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex h-full">
      <span className="sr-only">{L.contacts.loading}</span>
      <div aria-hidden="true" className="w-[320px] shrink-0 border-r border-border p-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="mb-1 h-12 animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
      <div aria-hidden="true" className="flex-1 p-8">
        <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-surface-2" />
      </div>
    </div>
  );
}
