import { useState } from 'react';
import { FileText, FileX } from 'lucide-react';
import type { Attachment, Message } from '@shared/domain';
import { L } from '../../i18n';
import { formatBubbleTime } from './dateUtils';

interface MessageBubbleProps {
  message: Message;
  udid: string;
}

/**
 * 4 varyant: gelen/giden × iMessage/SMS.
 * Gelen → sol, --surface-2 bg, --text.
 * Giden iMessage → sağ, --imessage bg, white.
 * Giden SMS → sağ, --sms bg, white.
 * Asimetrik radius (tail yok). Hover'da yan zaman damgası.
 */
export function MessageBubble({ message, udid }: MessageBubbleProps) {
  const out = message.isFromMe;
  const time = formatBubbleTime(message.dateIso);

  const bubbleColor = out
    ? message.service === 'iMessage'
      ? 'bg-imessage text-white'
      : 'bg-sms text-white'
    : 'bg-surface-2 text-text';

  const radius = out ? 'rounded-[18px] rounded-br-[4px]' : 'rounded-[18px] rounded-bl-[4px]';

  const hasText = (message.text ?? '').trim().length > 0;

  return (
    <div className={`group flex items-end gap-2 ${out ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex max-w-[min(540px,70%)] flex-col gap-1 ${out ? 'items-end' : 'items-start'}`}
      >
        {message.attachments.map((att, i) => (
          <AttachmentView key={i} att={att} udid={udid} out={out} />
        ))}
        {hasText && (
          <div
            className={`${bubbleColor} ${radius} px-3 py-2 text-[15px] leading-[1.45] [overflow-wrap:anywhere]`}
          >
            {message.text}
          </div>
        )}
        {/* Metin de ek de yoksa (çözülemeyen attributedBody, silinmiş/desteklenmeyen
            içerik) satır boş kalmasın — yalnızca saat görünüyordu. */}
        {!hasText && message.attachments.length === 0 && (
          <div
            className={`${radius} border border-dashed border-border px-3 py-2 text-sm italic text-text-muted`}
          >
            {L.messages.messageUnavailable}
          </div>
        )}
      </div>
      {time && (
        <span className="shrink-0 pb-1 text-xs tabular-nums text-text-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100">
          {time}
        </span>
      )}
    </div>
  );
}

function AttachmentView({ att, udid, out }: { att: Attachment; udid: string; out: boolean }) {
  const [error, setError] = useState(false);

  if (!att.fileId || error) {
    return (
      <div
        className={`flex items-center gap-2 rounded-[14px] border border-border bg-surface-2 px-3 py-2 text-xs italic text-text-muted ${
          out ? 'self-end' : 'self-start'
        }`}
      >
        <FileX className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="truncate font-mono not-italic">{baseName(att.filename)}</span>
        <span className="shrink-0">— {L.messages.attachmentMissing}</span>
      </div>
    );
  }

  const origUrl = `backup://orig/${udid}/${att.fileId}`;

  if (att.kind === 'image') {
    return (
      <img
        src={`backup://thumb/${udid}/${att.fileId}?size=320`}
        loading="lazy"
        decoding="async"
        alt={baseName(att.filename)}
        onError={() => setError(true)}
        className="max-h-80 cursor-pointer rounded-md object-contain"
      />
    );
  }

  if (att.kind === 'video') {
    return (
      <video
        src={origUrl}
        controls
        onError={() => setError(true)}
        className="max-h-80 rounded-md"
      />
    );
  }

  if (att.kind === 'audio') {
    return <audio src={origUrl} controls onError={() => setError(true)} className="w-64" />;
  }

  // Diğer dosya — ikon + ad + indir linki
  return (
    <a
      href={origUrl}
      download={baseName(att.filename)}
      className="flex items-center gap-2 rounded-[14px] border border-border bg-surface-2 px-3 py-2 text-sm text-text transition-colors duration-fast hover:bg-surface"
    >
      <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} />
      <span className="max-w-[280px] truncate font-mono text-xs">{baseName(att.filename)}</span>
    </a>
  );
}

function baseName(p: string): string {
  if (!p) return L.common.attachmentFallback;
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
