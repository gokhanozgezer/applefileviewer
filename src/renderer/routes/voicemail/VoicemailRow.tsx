import type { CSSProperties } from 'react';
import type { Voicemail } from '@shared/domain';
import { L } from '../../i18n';
import { formatListTimestamp } from '../messages/dateUtils';

interface VoicemailRowProps {
  voicemail: Voicemail;
  udid: string;
  /** react-window satır konumu (absolute top/height) — sanal listede zorunlu. */
  style?: CSSProperties;
}

/** Süre: saniye → "1:23" / "0:42". 0 ise "—". */
function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoicemailRow({ voicemail, udid, style }: VoicemailRowProps) {
  const primary =
    voicemail.contactName?.trim() || voicemail.sender.trim() || L.voicemail.unknownSender;
  const showNumberSub = !!voicemail.contactName?.trim() && !!voicemail.sender.trim();

  // AMR Chromium'da oynamaz → backup://transcoded?to=mp3 (Phase 7 ffmpeg AMR→MP3).
  const audioSrc = `backup://transcoded/${udid}/${voicemail.fileId}?to=mp3`;

  return (
    <li
      style={style}
      className="flex flex-col justify-center gap-2 rounded-md px-3 py-3 transition-colors duration-fast hover:bg-surface-2"
    >
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium text-text">{primary}</span>
            {voicemail.isUnplayed && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-accent"
                title={L.voicemail.unplayed}
                aria-label={L.voicemail.unplayed}
              />
            )}
          </span>
          {showNumberSub && (
            <span className="truncate font-mono text-[11px] text-text-subtle">
              {voicemail.sender}
            </span>
          )}
        </span>

        <span className="shrink-0 text-xs tabular-nums text-text-subtle">
          {formatDuration(voicemail.durationSec)}
        </span>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-subtle">
          {formatListTimestamp(voicemail.dateIso)}
        </span>
      </div>

      <audio controls preload="none" src={audioSrc} className="h-8 w-full">
        {L.voicemail.audioUnsupported}
      </audio>
    </li>
  );
}
