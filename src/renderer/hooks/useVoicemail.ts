import { useQuery } from '@tanstack/react-query';
import type { Voicemail } from '@shared/domain';

export function useVoicemail(udid: string, rootPath: string, enabled: boolean) {
  return useQuery<Voicemail[]>({
    queryKey: ['voicemail', 'list', udid],
    queryFn: () => window.api.voicemail.list({ udid, rootPath }),
    enabled,
  });
}
