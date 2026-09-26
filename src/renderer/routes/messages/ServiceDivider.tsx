import { ArrowRight } from 'lucide-react';
import type { MessageService } from '@shared/domain';

/**
 * Service değişim divider — peş peşe mesajlarda service değişince (iMessage→SMS).
 * Daima görünür (pasifleştirilmez). Header pill + bu divider = WCAG 1.4.1 tam karşılık.
 */
export function ServiceDivider({ from, to }: { from: MessageService; to: MessageService }) {
  return (
    <div className="my-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
      <span className="h-px flex-1 bg-border" />
      <span>{from}</span>
      <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
      <span>{to}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
