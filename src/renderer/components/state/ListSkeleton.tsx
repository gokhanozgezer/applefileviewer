import { L } from '../../i18n';

interface ListSkeletonProps {
  rows?: number;
  /** 'list' → panel içi tam genişlik; 'rows' → mx-auto max-w-3xl satır listesi. */
  variant?: 'list' | 'rows';
  /** Satır yüksekliği sınıfı (ör. 'h-14', 'h-20'). Varsayılan 'h-16'. */
  rowClassName?: string;
  /** Ekran okuyucuya duyurulan yükleme metni (ör. L.messages.loading).
   *  Verilmezse genel L.common.loading kullanılır. */
  label?: string;
}

/** Route liste iskeleti — animate-pulse satırlar. role=status + aria-busy:
 *  görsel satırlar aria-hidden, yükleme metni yalnızca ekran okuyucuya (sr-only). */
export function ListSkeleton({
  rows = 8,
  variant = 'list',
  rowClassName = 'h-16',
  label,
}: ListSkeletonProps) {
  const container =
    variant === 'rows' ? 'mx-auto flex max-w-3xl flex-col gap-1 p-2' : 'flex flex-col gap-1 p-2';
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={container}>
      <span className="sr-only">{label ?? L.common.loading}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`${rowClassName} animate-pulse rounded-md bg-surface-2`}
        />
      ))}
    </div>
  );
}
