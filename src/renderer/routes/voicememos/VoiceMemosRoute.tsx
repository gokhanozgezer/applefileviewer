import { forwardRef, useCallback, useRef, useState, type HTMLAttributes } from 'react';
import { useParams } from 'react-router-dom';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { AudioLines } from 'lucide-react';
import type { VoiceMemo } from '@shared/domain';
import { useUIStore } from '../../store/uiStore';
import { useVoiceMemos } from '../../hooks/useVoiceMemos';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { EmptyState } from '../../components/state/EmptyState';
import { ListSkeleton } from '../../components/state/ListSkeleton';
import { ExportMenu, runExportSave, runFolderExport } from '../../components/ExportMenu';
import { audioFileName } from '../voicemail/audioFileName';
import { VoiceMemoRow } from './VoiceMemoRow';

// B5 — sanal liste. Satır: py-3 + tek başlık satırı + gap-2 + <audio h-8> ≈ 87px → 88.
// NOT: satır viewport dışına çıkınca unmount olur; audio oynatma durumu sıfırlanır
// (kabul edildi — preload="none" zaten vardı).
const ROW_HEIGHT = 88;
// Satırlar arası eski gap-1 boşluğu (4px) — itemSize'a eklenir, li'den düşülür.
const ROW_GAP = 4;
// Sarmalayıcının py-2 dikey padding'i (8+8).
const WRAP_PY = 16;

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

/** Liste CSV/PDF + ses dosyalarını klasöre toplu kopyalama. */
type AudioExportAction = 'csv' | 'pdf' | 'audio';

interface RowData {
  memos: VoiceMemo[];
  udid: string;
}

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const rowStyle = { ...style, height: (style.height as number) - ROW_GAP };
  return <VoiceMemoRow memo={data.memos[index]!} udid={data.udid} style={rowStyle} />;
}

export function VoiceMemosRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';
  const enabled = !!udid && !!activeBackup;

  const { ref: bodyRef, size } = useElementSize();

  const {
    data: memos,
    isLoading,
    isError,
    error,
    refetch,
  } = useVoiceMemos(udid ?? '', rootPath, enabled);

  const onExport = (action: AudioExportAction) => {
    if (!memos || memos.length === 0 || !udid) return;
    if (action === 'audio') {
      // Orijinal ses dosyaları (backup'taki hash'li dosya) okunabilir adla kopyalanır.
      void runFolderExport(() =>
        window.api.export.copyMediaBatch({
          udid,
          rootPath,
          items: memos.map((m) => ({
            fileId: m.fileId,
            suggestedName: audioFileName(m.dateIso, m.title.trim() || L.voicememos.untitled, 'm4a'),
          })),
        }),
      );
      return;
    }
    void runExportSave({
      kind: 'voiceMemos',
      format: action,
      payload: memos,
      suggestedName: L.voicememos.title,
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-xl font-semibold text-text">{L.voicememos.title}</h1>
        {(memos?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-text-muted">
              {memos!.length} {L.voicememos.countSuffix}
            </span>
            <ExportMenu<AudioExportAction>
              options={[
                { value: 'csv', label: L.exportMenu.asCsv },
                { value: 'pdf', label: L.exportMenu.asPdf },
                { value: 'audio', label: L.exportMenu.audioFiles },
              ]}
              onSelect={onExport}
              aria-label={L.export.voiceMemosAria}
            />
          </div>
        )}
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <ListSkeleton variant="rows" rows={6} rowClassName="h-20" />
        ) : isError ? (
          <RouteError title={L.voicememos.errorTitle} error={error} onRetry={() => refetch()} />
        ) : (memos?.length ?? 0) === 0 ? (
          <EmptyState icon={AudioLines} title={L.voicememos.emptyTitle} />
        ) : (
          <div className="mx-auto h-full max-w-3xl px-2 py-2">
            <FixedSizeList<RowData>
              height={Math.max(0, size.height - WRAP_PY)}
              width="100%"
              itemCount={memos!.length}
              itemSize={ROW_HEIGHT + ROW_GAP}
              itemData={{ memos: memos!, udid: udid ?? '' }}
              innerElementType={InnerUl}
              overscanCount={4}
            >
              {Row}
            </FixedSizeList>
          </div>
        )}
      </div>
    </div>
  );
}
