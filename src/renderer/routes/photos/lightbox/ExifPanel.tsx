import { Copy } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { PhotoMeta } from '@shared/domain';
import { L } from '../../../i18n';
import { dateLocale } from '../../../i18n/dateLocale';

interface Props {
  item: PhotoMeta;
  open: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </>
  );
}

export function ExifPanel({ item, open }: Props) {
  const dateStr = item.dateTakenIso
    ? format(new Date(item.dateTakenIso), 'd MMM yyyy HH:mm:ss', { locale: dateLocale() })
    : '—';

  const resolution =
    item.width != null && item.height != null ? `${item.width}×${item.height}` : '—';

  const copyFileId = () => {
    navigator.clipboard
      .writeText(item.fileId)
      .then(() => toast.success(L.lightbox.copied))
      .catch(() => undefined);
  };

  return (
    <aside
      aria-hidden={!open}
      className="absolute right-0 top-0 z-10 h-full w-80 transform border-l border-border bg-surface transition-transform duration-medium ease-emphasized"
      style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
    >
      <div className="flex h-full flex-col overflow-y-auto p-4">
        <h2 className="mb-3 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
          {L.lightbox.exifTitle}
        </h2>

        <dl className="grid grid-cols-[88px_1fr] gap-y-2 text-sm">
          <Row label={L.lightbox.exifDate}>
            <span className="tabular-nums">{dateStr}</span>
          </Row>
          <Row label={L.lightbox.exifResolution}>
            <span className="tabular-nums">{resolution}</span>
          </Row>
          <Row label={L.lightbox.exifFormat}>{item.ext}</Row>
        </dl>

        <div className="my-3 border-t border-border" />

        <dl className="grid grid-cols-[88px_1fr] gap-y-2 text-sm">
          <Row label={L.lightbox.exifFileId}>
            <div className="flex items-start gap-1">
              <span className="break-all font-mono text-xs">{item.fileId}</span>
              <button
                type="button"
                onClick={copyFileId}
                aria-label={L.lightbox.copy}
                className="mt-0.5 shrink-0 cursor-pointer rounded-sm p-0.5 text-text-subtle outline-none transition-colors duration-fast hover:text-text focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </Row>
          <Row label={L.lightbox.exifPath}>
            <span className="break-all font-mono text-xs">{item.relativePath}</span>
          </Row>
        </dl>
      </div>
    </aside>
  );
}
