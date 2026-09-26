import { useQuery } from '@tanstack/react-query';
import type { Contact } from '@shared/domain';

export function useContacts(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<Contact[]>({
    queryKey: ['contacts', 'list', udid],
    queryFn: () => window.api.contacts.list({ udid, rootPath }),
    enabled,
  });
}
