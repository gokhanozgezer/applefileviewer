import type { CSSProperties } from 'react';
import { format } from 'date-fns';
import type { Note } from '@shared/domain';
import { L } from '../../i18n';
import { dateLocale } from '../../i18n/dateLocale';

interface Props {
  note: Note;
  selected: boolean;
  onSelect: (id: number) => void;
  /** react-window satır konumu (absolute top/height) — sanal listede zorunlu. */
  style?: CSSProperties;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'd MMM yyyy', { locale: dateLocale() });
  } catch {
    return '';
  }
}

export function NoteListItem({ note, selected, onSelect, style }: Props) {
  const title = note.title || L.notes.untitled;
  const date = fmtDate(note.modifiedIso ?? note.createdIso);

  return (
    <li style={style}>
      <button
        type="button"
        onClick={() => onSelect(note.id)}
        className={`flex h-full w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-md px-3 py-2.5 text-left transition-colors duration-fast ${
          selected
            ? 'border-l-2 border-accent bg-surface text-text'
            : 'text-text-muted hover:bg-surface hover:text-text'
        }`}
      >
        <span className="truncate text-sm font-medium text-text">{title}</span>
        {note.snippet && (
          <span className="line-clamp-2 text-xs text-text-muted">{note.snippet}</span>
        )}
        <span className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-text-subtle">
          {date && <span>{date}</span>}
          {note.folderName && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{note.folderName}</span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}
