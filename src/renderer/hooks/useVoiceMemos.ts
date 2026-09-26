import { useQuery } from '@tanstack/react-query';
import type { VoiceMemo } from '@shared/domain';

export function useVoiceMemos(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<VoiceMemo[]>({
    queryKey: ['voicememos', 'list', udid],
    queryFn: () => window.api.voicememos.list({ udid, rootPath }),
    enabled,
  });
}
