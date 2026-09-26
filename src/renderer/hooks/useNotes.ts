import { useQuery } from '@tanstack/react-query';
import type { Note } from '@shared/domain';

export function useNotes(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<Note[]>({
    queryKey: ['notes', 'list', udid],
    queryFn: () => window.api.notes.list({ udid, rootPath }),
    enabled,
  });
}
