import type { MessageService } from '@shared/domain';
import { L } from '../../i18n';

/**
 * Service pill — header'da daimî (WCAG 1.4.1 dayanağı: renk tek başına service
 * taşımaz, bu pill ana sinyaldir; bubble rengi ikincildir).
 */
export function ServicePill({ service }: { service: MessageService }) {
  if (service === 'iMessage') {
    return (
      <span className="rounded-full bg-imessage/10 px-2 py-0.5 text-[11px] font-medium text-imessage ring-1 ring-imessage/30">
        {L.messages.serviceImessage}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sms/10 px-2 py-0.5 text-[11px] font-medium text-[#1B7E36] ring-1 ring-sms/30 dark:text-sms">
      {L.messages.serviceSms}
    </span>
  );
}
