import { format } from 'date-fns';
import { Folder, Clock } from 'lucide-react';
import type { Note } from '@shared/domain';
import { L } from '../../i18n';
import { dateLocale } from '../../i18n/dateLocale';
import { ExportMenu, runExportSave } from '../../components/ExportMenu';
import { RichBody } from './RichBody';

interface Props {
  note: Note;
}

type NoteExportFormat = 'txt' | 'pdf';

function fmtDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), 'd MMM yyyy HH:mm', { locale: dateLocale() });
  } catch {
    return null;
  }
}

export function NoteDetail({ note }: Props) {
  const title = note.title || L.notes.untitled;
  const modified = fmtDateTime(note.modifiedIso);
  const created = fmtDateTime(note.createdIso);

  const onExport = (format: NoteExportFormat) => {
    void runExportSave({ kind: 'note', format, payload: note, suggestedName: title });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-8 py-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-semibold text-text">{title}</h1>
          <ExportMenu<NoteExportFormat>
            className="shrink-0"
            options={[
              { value: 'txt', label: L.exportMenu.asTxt },
              { value: 'pdf', label: L.exportMenu.asPdf },
            ]}
            onSelect={onExport}
            aria-label={L.export.noteAria}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
          {note.folderName && (
            <span className="flex items-center gap-1.5" title={L.notes.folderLabel}>
              <Folder className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              <span className="sr-only">{L.notes.folderLabel}: </span>
              {note.folderName}
            </span>
          )}
          {modified && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
              {L.notes.modifiedLabel}: {modified}
            </span>
          )}
          {created && (
            <span className="tabular-nums">
              {L.notes.createdLabel}: {created}
            </span>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-5">
          {note.body ? (
            <RichBody body={note.body} runs={note.runs} />
          ) : (
            <p className="text-sm italic text-text-subtle">{L.notes.emptyBody}</p>
          )}
        </div>
      </div>
    </div>
  );
}
