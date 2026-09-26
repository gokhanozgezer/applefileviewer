import type { CSSProperties } from 'react';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, AudioLines } from 'lucide-react';
import type { CallRecord } from '@shared/domain';
import { L } from '../../i18n';
import { formatListTimestamp } from '../messages/dateUtils';

interface CallRowProps {
  call: CallRecord;
  /** react-window satır konumu (absolute top/height) — sanal listede zorunlu. */
  style?: CSSProperties;
}

/** Süre: saniye → "1:23" / "0:42" / "1:02:05". 0 ise "—". */
function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function CallRow({ call, style }: CallRowProps) {
  // Yön/missed ikonu: cevapsız → kırmızı PhoneMissed, giden → PhoneOutgoing, gelen → PhoneIncoming
  const DirIcon = call.isMissed
    ? PhoneMissed
    : call.direction === 'outgoing'
      ? PhoneOutgoing
      : PhoneIncoming;
  const dirColor = call.isMissed ? 'text-danger' : 'text-text-muted';

  const directionLabel = call.isMissed
    ? L.calls.missed
    : call.direction === 'outgoing'
      ? L.calls.outgoing
      : L.calls.incoming;

  const TypeIcon =
    call.callType === 'facetime-video'
      ? Video
      : call.callType === 'facetime-audio'
        ? AudioLines
        : null;
  const typeLabel =
    call.callType === 'facetime-video'
      ? L.calls.faceTimeVideo
      : call.callType === 'facetime-audio'
        ? L.calls.faceTimeAudio
        : null;

  const primary = call.contactName?.trim() || call.number.trim() || L.calls.unknownNumber;
  const showNumberSub = !!call.contactName?.trim() && !!call.number.trim();

  return (
    <li
      style={style}
      className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-fast hover:bg-surface-2"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center ${dirColor}`}
        aria-label={directionLabel}
      >
        <DirIcon className="h-5 w-5" strokeWidth={1.5} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span
            className={`truncate text-[15px] font-medium ${call.isMissed ? 'text-danger' : 'text-text'}`}
          >
            {primary}
          </span>
          {TypeIcon && (
            <span
              className="flex items-center gap-1 text-text-subtle"
              title={typeLabel ?? undefined}
            >
              <TypeIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>{directionLabel}</span>
          {showNumberSub && (
            <>
              <span className="text-text-subtle">·</span>
              <span className="truncate font-mono text-[11px] text-text-subtle">{call.number}</span>
            </>
          )}
        </span>
      </span>

      <span className="shrink-0 text-xs tabular-nums text-text-subtle">
        {formatDuration(call.durationSec)}
      </span>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-subtle">
        {formatListTimestamp(call.dateIso)}
      </span>
    </li>
  );
}
