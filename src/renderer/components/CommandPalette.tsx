// Global arama komut paleti (spec §7) — Ctrl+K / Ctrl+F ile açılır.
// Radix Dialog primitifleri (ShortcutsHelpDialog ile aynı overlay deseni),
// içerik üstte konumlanır; sonuçlar domain'e göre gruplanır (Mesajlar / WhatsApp /
// Notlar / Kişiler / Aramalar / Sesli Mesaj / Ses Kayıtları / Fotoğraflar) ve Enter
// derin bağlantıya gider.
//
// Eskimiş yanıt koruması: her istek artan bir sıra numarası alır; yalnız EN SON
// isteğin yanıtı state'e yazılır (hızlı yazarken geç dönen eski sorgu sonucu,
// yeni sorgunun sonucunu ezemez).
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Loader2,
  MessageSquare,
  MessageCircle,
  StickyNote,
  Users,
  Phone,
  Voicemail,
  Mic,
  Image,
  AlertTriangle,
} from 'lucide-react';
import type { GlobalSearchResult, SearchDomain, SearchHit } from '@shared/domain';
import { Dialog, DialogPortal, DialogOverlay } from './ui/dialog';
import { useUIStore } from '../store/uiStore';
import { L } from '../i18n';
import { formatListTimestamp } from '../routes/messages/dateUtils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DOMAIN_ORDER: readonly SearchDomain[] = [
  'messages',
  'whatsapp',
  'notes',
  'contacts',
  'calls',
  'voicemail',
  'voicememos',
  'photos',
];

const DOMAIN_ICON: Record<SearchDomain, typeof MessageSquare> = {
  messages: MessageSquare,
  whatsapp: MessageCircle,
  notes: StickyNote,
  contacts: Users,
  calls: Phone,
  voicemail: Voicemail,
  voicememos: Mic,
  photos: Image,
};

const MIN_CHARS = 2;
const MAX_CHARS = 200;
const DEBOUNCE_MS = 200;

/**
 * Hit → route içi derin bağlantı (App.tsx /backup/:udid/* düzeni).
 * Mesaj/WhatsApp/not/kişi route'ları seçimi search param'dan okur; aramalar,
 * sesli mesaj, ses kayıtları ve fotoğraflar route'ları şimdilik öğe seçimi
 * desteklemez — ilgili listeye gidilir.
 */
function hitPath(hit: SearchHit, udid: string): string | null {
  const base = `/backup/${udid}`;
  switch (hit.domain) {
    case 'messages':
      return hit.chatId !== undefined ? `${base}/messages?chat=${hit.chatId}` : null;
    case 'whatsapp':
      return hit.sessionId !== undefined ? `${base}/whatsapp?session=${hit.sessionId}` : null;
    case 'notes':
      return hit.noteId !== undefined ? `${base}/notes?note=${hit.noteId}` : null;
    case 'contacts':
      return hit.contactId !== undefined ? `${base}/contacts?contact=${hit.contactId}` : null;
    case 'calls':
      return `${base}/calls`;
    case 'voicemail':
      return `${base}/voicemail`;
    case 'voicememos':
      return `${base}/voicememos`;
    case 'photos':
      return `${base}/photos`;
  }
}

/** Palet input'u için debounce. */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Metnin eşleşen aralığını <mark> ile vurgula (aralık yoksa düz metin). */
function Highlighted({ text, match }: { text: string; match?: { start: number; length: number } }) {
  if (!match || match.length <= 0 || match.start < 0 || match.start + match.length > text.length) {
    return <>{text}</>;
  }
  const end = match.start + match.length;
  return (
    <>
      {text.slice(0, match.start)}
      <mark className="rounded-sm bg-accent/25 px-px text-text">
        {text.slice(match.start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

interface SearchState {
  /** Bu sonucun ait olduğu sorgu — ekranda yalnız güncel sorgunun sonucu gösterilir. */
  query: string;
  result: GlobalSearchResult | null;
  error: boolean;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const activeBackup = useUIStore((s) => s.activeBackup);

  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS).trim();

  const [state, setState] = React.useState<SearchState>({
    query: '',
    result: null,
    error: false,
  });
  const [loading, setLoading] = React.useState(false);
  const seqRef = React.useRef(0);

  // Kapanınca durumu sıfırla — bir sonraki açılış temiz başlar.
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setQuery('');
      setActiveIndex(0);
    }
    onOpenChange(v);
  };

  const udid = activeBackup?.udid;
  const rootPath = activeBackup?.rootPath;
  const canSearch =
    !!udid && debouncedQuery.length >= MIN_CHARS && debouncedQuery.length <= MAX_CHARS;

  React.useEffect(() => {
    // Her değişimde sıra ilerler → uçuştaki eski istekler geçersizleşir.
    const seq = ++seqRef.current;
    if (!open || !canSearch || !udid || !rootPath) {
      setLoading(false);
      if (!open) setState({ query: '', result: null, error: false });
      return;
    }
    setLoading(true);
    window.api.search
      .global({ udid, rootPath, query: debouncedQuery })
      .then((result) => {
        if (seq !== seqRef.current) return; // eskimiş yanıt — yok say
        setState({ query: debouncedQuery, result, error: false });
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setState({ query: debouncedQuery, result: null, error: true });
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, [open, canSearch, udid, rootPath, debouncedQuery]);

  // Ekrandaki sonuç yalnız güncel sorguya aitse kullanılır.
  const current = canSearch && state.query === debouncedQuery ? state : null;
  const data = current?.result ?? null;

  // Domain sırasına göre gruplanmış + klavye gezinmesi için düz sıra.
  const grouped = React.useMemo(() => {
    const hits = data?.hits ?? [];
    return DOMAIN_ORDER.map((domain) => ({
      domain,
      hits: hits.filter((h) => h.domain === domain),
    })).filter((g) => g.hits.length > 0);
  }, [data]);

  const flatHits = React.useMemo(() => grouped.flatMap((g) => g.hits), [grouped]);

  // Yeni sonuç geldiğinde aktif satırı başa al.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [data]);

  const openHit = React.useCallback(
    (hit: SearchHit) => {
      if (!activeBackup) return;
      const path = hitPath(hit, activeBackup.udid);
      if (!path) return;
      handleOpenChange(false);
      navigate(path);
    },
    // handleOpenChange her render'da yeniden oluşur; bağımlılık olarak
    // navigate/activeBackup/onOpenChange yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBackup, navigate, onOpenChange],
  );

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flatHits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home' && flatHits.length > 0 && e.ctrlKey) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && flatHits.length > 0 && e.ctrlKey) {
      e.preventDefault();
      setActiveIndex(flatHits.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flatHits[activeIndex];
      if (hit) openHit(hit);
    }
  };

  // Aktif satır görünür kalsın (klavye ile gezinirken).
  const listRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-hit-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const showMinCharsHint = !!activeBackup && debouncedQuery.length < MIN_CHARS;
  const showError = canSearch && !loading && !!current?.error;
  const showEmpty = canSearch && !loading && data !== null && flatHits.length === 0;
  const failed = data?.failedDomains ?? [];

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Autofocus input'a gitsin (Radix varsayılanı content'e odaklanır).
            e.preventDefault();
            (
              (e.currentTarget as HTMLElement | null)?.querySelector(
                'input',
              ) as HTMLInputElement | null
            )?.focus();
          }}
          className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">{L.palette.title}</DialogPrimitive.Title>

          {/* Arama input'u */}
          <div className="relative border-b border-border">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={query}
              maxLength={MAX_CHARS}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={L.palette.placeholder}
              aria-label={L.palette.title}
              aria-busy={loading}
              className="w-full bg-transparent py-3 pl-9 pr-10 text-sm text-text outline-none placeholder:text-text-subtle"
            />
            {loading && (
              <Loader2
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted"
                strokeWidth={1.5}
              />
            )}
          </div>

          {/* Gövde */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
            {!activeBackup ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">{L.palette.noBackup}</p>
            ) : showMinCharsHint ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">
                {L.palette.hintMinChars}
              </p>
            ) : showError ? (
              <p
                role="alert"
                className="flex items-center justify-center gap-1.5 px-3 py-6 text-center text-sm text-text-muted"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                {L.palette.error}
              </p>
            ) : showEmpty ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">
                {L.palette.noResultsPrefix}
                {`"${debouncedQuery}"`}
                {L.palette.noResultsSuffix}
              </p>
            ) : flatHits.length === 0 ? (
              loading ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">
                  {L.palette.searching}
                </p>
              ) : null
            ) : (
              <div role="listbox" aria-label={L.palette.title}>
                {grouped.map((group) => {
                  const Icon = DOMAIN_ICON[group.domain];
                  return (
                    <section key={group.domain} className="mb-1 last:mb-0">
                      <h3 className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {L.palette.groups[group.domain]}
                      </h3>
                      <ul>
                        {group.hits.map((hit) => {
                          flatIndex += 1;
                          const idx = flatIndex;
                          const isActive = idx === activeIndex;
                          return (
                            <li key={`${hit.domain}-${idx}`}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                data-hit-index={idx}
                                tabIndex={-1}
                                onMouseEnter={() => setActiveIndex(idx)}
                                onClick={() => openHit(hit)}
                                className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors duration-fast ${
                                  isActive ? 'bg-surface-2' : ''
                                }`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm text-text">
                                    <Highlighted text={hit.title} match={hit.titleMatch} />
                                  </span>
                                  {hit.snippet && (
                                    <span className="block truncate text-xs text-text-muted">
                                      <Highlighted text={hit.snippet} match={hit.snippetMatch} />
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-text-subtle">
                                  {formatListTimestamp(hit.dateIso)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {/* Kısmi hata + tookMs — subtil altbilgi */}
          {data !== null && (
            <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-[11px] text-text-subtle">
              {failed.length > 0 && (
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  {L.palette.partialFailurePrefix}
                  {failed.map((d) => L.palette.groups[d]).join(', ')}
                </span>
              )}
              <span className="ml-auto tabular-nums">
                {data.tookMs}
                {L.palette.tookSuffix}
              </span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
