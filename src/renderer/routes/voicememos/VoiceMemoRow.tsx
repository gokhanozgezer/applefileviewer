import type { CSSProperties } from 'react';
import { AudioLines } from 'lucide-react';
import type { VoiceMemo } from '@shared/domain';
import { L } from '../../i18n';
import { formatListTimestamp } from '../messages/dateUtils';

interface VoiceMemoRowProps {
  memo: VoiceMemo;
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

export function VoiceMemoRow({ memo, udid, style }: VoiceMemoRowProps) {
  const title = memo.title.trim() || L.voicememos.untitled;

  // m4a Chromium native oynar → backup://orig (transcode GEREKMEZ).
  const audioSrc = `backup://orig/${udid}/${memo.fileId}`;

  return (
    <li
      style={style}
      className="flex flex-col justify-center gap-2 rounded-md px-3 py-3 transition-colors duration-fast hover:bg-surface-2"
    >
      <div className="flex items-center gap-3">
        <AudioLines className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text">{title}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-subtle">
          {formatDuration(memo.durationSec)}
        </span>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-subtle">
          {formatListTimestamp(memo.dateIso)}
        </span>
      </div>

      <audio controls preload="none" src={audioSrc} className="h-8 w-full">
        {L.voicememos.audioUnsupported}
      </audio>
    </li>
  );
}
