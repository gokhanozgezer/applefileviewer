import { useQuery } from '@tanstack/react-query';
import type { CallRecord } from '@shared/domain';

export function useCalls(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<CallRecord[]>({
    queryKey: ['calls', 'list', udid],
    queryFn: () => window.api.calls.list({ udid, rootPath }),
    enabled,
  });
}
