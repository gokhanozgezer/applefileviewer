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
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { StickyNote } from 'lucide-react';
import type { Note } from '@shared/domain';
import { useUIStore } from '../../store/uiStore';
import { useNotes } from '../../hooks/useNotes';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { EmptyState } from '../../components/state/EmptyState';
import { ListSkeleton } from '../../components/state/ListSkeleton';
import { ExportMenu, runFolderExport } from '../../components/ExportMenu';
import { collator } from '../../i18n/dateLocale';
import { Select } from '../../components/ui/select';
import { NoteListItem } from './NoteListItem';
import { NoteDetail } from './NoteDetail';

// B5 — sanal liste. Satır: py-2.5 + başlık (text-sm) + 2 satır snippet
// (line-clamp-2) + tarih/klasör satırı ≈ 98px → 100 (kısa snippet'lerde satır
// yüksekliği sabit kalır; buton h-full ile hover alanı tüm satırı kaplar).
const NOTE_ROW = 100;
// Satırlar arası eski space-y-0.5 boşluğu (2px).
const ROW_GAP = 2;
// Sarmalayıcının p-2 dikey padding'i (8+8).
const WRAP_PY = 16;

// Konteyner ölçümü — PhotosRoute'taki ResizeObserver deseni (callback-ref:
// erken return'lü route'ta liste paneli sonradan mount olur, güvenli).
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

/** Klasör filtresinde "Klasörsüz" notlar için ayrılmış değer (gerçek klasör adıyla çakışmaz). */
const NO_FOLDER = '__afv_no_folder__';

/** Liste başlığı export menüsü — tüm notlar → klasör (not başına TXT). */
type NotesListExportAction = 'txtFolder';

interface RowData {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const note = data.notes[index]!;
  const rowStyle = { ...style, height: (style.height as number) - ROW_GAP };
  return (
    <NoteListItem
      note={note}
      selected={data.selectedId === note.id}
      onSelect={data.onSelect}
      style={rowStyle}
    />
  );
}

export function NotesRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';
  const enabled = !!udid && !!activeBackup;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [folder, setFolder] = useState<string>('');

  // Global arama derin bağlantısı: ?note=<noteId> → notu seç, parametreyi
  // temizle (replace). Klasör filtresi sıfırlanır ki hedef not görünür kalsın.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const note = searchParams.get('note');
    if (note === null) return;
    const id = Number(note);
    if (Number.isFinite(id)) {
      setFolder('');
      setSelectedId(id);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const { ref: listPanelRef, size } = useElementSize();

  const {
    data: notes,
    isLoading,
    isError,
    error,
    refetch,
  } = useNotes(udid ?? '', rootPath, enabled);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes ?? []) if (n.folderName) set.add(n.folderName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, collator()));
  }, [notes]);

  const hasUnfiled = useMemo(() => (notes ?? []).some((n) => !n.folderName), [notes]);

  const folderOptions = useMemo(
    () => [
      { value: '', label: L.notes.allFolders },
      ...folders.map((f) => ({ value: f, label: f })),
      ...(hasUnfiled ? [{ value: NO_FOLDER, label: L.notes.noFolder }] : []),
    ],
    [folders, hasUnfiled],
  );

  const visible = useMemo(() => {
    if (!notes) return [];
    if (!folder) return notes;
    if (folder === NO_FOLDER) return notes.filter((n) => !n.folderName);
    return notes.filter((n) => (n.folderName ?? '') === folder);
  }, [notes, folder]);

  const selected = useMemo(
    () => visible.find((n) => n.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const rowData = useMemo<RowData>(
    () => ({ notes: visible, selectedId: selected?.id ?? null, onSelect: setSelectedId }),
    [visible, selected],
  );

  const onExportList = (_action: NotesListExportAction) => {
    if (!udid) return;
    // Notlar main'de yeniden okunur (filtreden bağımsız TÜM notlar) — büyük payload IPC'den geçmez.
    void runFolderExport(() => window.api.export.notesFolder({ udid, rootPath }));
  };

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="w-[320px] shrink-0 border-r border-border">
          <ListSkeleton />
        </div>
      </div>
    );
  }

  if (isError) {
    return <RouteError title={L.notes.errorTitle} error={error} onRetry={() => refetch()} />;
  }

  if ((notes?.length ?? 0) === 0) {
    return <EmptyState icon={StickyNote} title={L.notes.emptyTitle} />;
  }

  return (
    <div className="flex h-full">
      {/* Liste paneli — 320px */}
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h1 className="text-base font-semibold text-text">{L.notes.title}</h1>
          <div className="flex items-center gap-1">
            <span className="text-xs tabular-nums text-text-muted">
              {visible.length} {L.notes.countSuffix}
            </span>
            <ExportMenu<NotesListExportAction>
              options={[{ value: 'txtFolder', label: L.exportMenu.allNotesTxt }]}
              onSelect={onExportList}
              aria-label={L.export.allNotesAria}
            />
          </div>
        </div>

        {folders.length > 0 && (
          <div className="shrink-0 border-b border-border px-3 py-2">
            <Select
              value={folder}
              options={folderOptions}
              onChange={(v) => {
                setFolder(v);
                setSelectedId(null);
              }}
              aria-label={L.notes.folderLabel}
            />
          </div>
        )}

        <div ref={listPanelRef} className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full p-2">
            <FixedSizeList<RowData>
              height={Math.max(0, size.height - WRAP_PY)}
              width="100%"
              itemCount={visible.length}
              itemSize={NOTE_ROW + ROW_GAP}
              itemData={rowData}
              innerElementType={InnerUl}
              overscanCount={6}
            >
              {Row}
            </FixedSizeList>
          </div>
        </div>
      </div>

      {/* Detay paneli */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <NoteDetail note={selected} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <p className="text-sm text-text-muted">{L.notes.selectPrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
