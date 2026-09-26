import { forwardRef, useCallback, useRef, useState, type HTMLAttributes } from 'react';
import { useParams } from 'react-router-dom';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { Phone } from 'lucide-react';
import type { CallRecord } from '@shared/domain';
import { useUIStore } from '../../store/uiStore';
import { useCalls } from '../../hooks/useCalls';
import { L } from '../../i18n';
import { RouteError } from '../../components/state/RouteError';
import { EmptyState } from '../../components/state/EmptyState';
import { ListSkeleton } from '../../components/state/ListSkeleton';
import { ExportMenu, runExportSave } from '../../components/ExportMenu';
import { CallRow } from './CallRow';

// B5 — sanal liste: binlerce arama kaydında ilk render janksız olsun.
// Satır yüksekliği h-14 (56px) — iskelet (rowClassName="h-14") ile aynı.
const ROW_HEIGHT = 56;
// Sarmalayıcının py-2 dikey padding'i (8+8) — liste yüksekliğinden düşülür.
const WRAP_PY = 16;

// Konteyner ölçümü — PhotosRoute'taki ResizeObserver deseni (callback-ref:
// erken return'lü route'larda da güvenli; el mount olunca observe başlar).
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

// İç konteyner <ul> — liste semantiği korunur (li satırlar).
const InnerUl = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(
  function InnerUl(props, ref) {
    return <ul ref={ref} {...props} />;
  },
);

type CallsExportFormat = 'csv' | 'pdf';

function Row({ index, style, data }: ListChildComponentProps<CallRecord[]>) {
  return <CallRow call={data[index]!} style={style} />;
}

export function CallsRoute() {
  const { udid } = useParams<{ udid: string }>();
  const activeBackup = useUIStore((s) => s.activeBackup);
  const rootPath = activeBackup?.rootPath ?? '';
  const enabled = !!udid && !!activeBackup;

  const { ref: bodyRef, size } = useElementSize();

  const {
    data: calls,
    isLoading,
    isError,
    error,
    refetch,
  } = useCalls(udid ?? '', rootPath, enabled);

  const onExport = (format: CallsExportFormat) => {
    if (!calls || calls.length === 0) return;
    void runExportSave({
      kind: 'callLog',
      format,
      payload: calls,
      suggestedName: L.calls.title,
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-xl font-semibold text-text">{L.calls.title}</h1>
        {(calls?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-text-muted">
              {calls!.length} {L.calls.countSuffix}
            </span>
            <ExportMenu<CallsExportFormat>
              options={[
                { value: 'csv', label: L.exportMenu.asCsv },
                { value: 'pdf', label: L.exportMenu.asPdf },
              ]}
              onSelect={onExport}
              aria-label={L.export.callsAria}
            />
          </div>
        )}
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <ListSkeleton variant="rows" rowClassName="h-14" />
        ) : isError ? (
          <RouteError title={L.calls.errorTitle} error={error} onRetry={() => refetch()} />
        ) : (calls?.length ?? 0) === 0 ? (
          <EmptyState icon={Phone} title={L.calls.emptyTitle} />
        ) : (
          <div className="mx-auto h-full max-w-3xl px-2 py-2">
            <FixedSizeList<CallRecord[]>
              height={Math.max(0, size.height - WRAP_PY)}
              width="100%"
              itemCount={calls!.length}
              itemSize={ROW_HEIGHT}
              itemData={calls!}
              innerElementType={InnerUl}
              overscanCount={8}
            >
              {Row}
            </FixedSizeList>
          </div>
        )}
      </div>
    </div>
  );
}
