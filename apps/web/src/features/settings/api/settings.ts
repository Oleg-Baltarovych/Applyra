// PATCH /api/v1/me/settings (06 §7.1, FR-PROF-01). Settings are part of the `me` query (auth feature): the response
// (full UserSettings) replaces `me.settings` in the cache, so no refetch is needed.
import { type UpdateUserSettings, UserSettings } from '@applyra/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meQuery } from '@/features/auth';
import { request } from '@/lib/api/client';

export const updateSettings = (patch: UpdateUserSettings) =>
  request({ method: 'PATCH', path: '/me/settings', body: patch, schema: UserSettings });

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(meQuery.queryKey, (me) => (me ? { ...me, settings } : me));
    },
  });
}
