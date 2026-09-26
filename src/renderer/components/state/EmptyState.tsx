import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** İkinci satır ipucu (ör. klavye kısayolu) — varsa dikey boşluk gap-2 olur. */
  description?: string;
  /** Dar liste panelleri (320px) için küçük ikon — h-7. Varsayılan h-10. */
  compact?: boolean;
  /** Kök yükseklik/genişleme sınıfı — panel içinde 'flex-1' geçilebilir. */
  className?: string;
}

/** Route boş-durum bloğu — Lucide ikon + tek satır başlık (+ opsiyonel ipucu). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
  className = 'h-full',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${
        description ? 'gap-2' : 'gap-3'
      } px-4 text-center ${className}`}
    >
      <Icon
        className={compact ? 'h-7 w-7 text-text-subtle' : 'h-10 w-10 text-text-subtle'}
        strokeWidth={1.5}
      />
      <p className="max-w-md text-sm text-text-muted">{title}</p>
      {description && <p className="text-xs text-text-subtle">{description}</p>}
    </div>
  );
}
