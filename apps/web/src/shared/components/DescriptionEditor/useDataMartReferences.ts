import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../../../features/idp/hooks/useAuthState';
import { dataMartService } from '../../../features/data-marts/shared/services/data-mart.service';
import { DataMartStatus } from '../../../features/data-marts/shared/enums/data-mart-status.enum';
import type { DataMartReference } from './data-mart-mentions';

export function useDataMartReferences(
  projectId: string,
  currentDataMartId?: string
): () => Promise<DataMartReference[]> {
  const queryClient = useQueryClient();
  const user = useUser();
  return useCallback(async () => {
    if (!projectId || user?.projectId !== projectId) return [];
    const references = await queryClient.query({
      queryKey: ['description-data-mart-references', projectId, user.id],
      queryFn: async ({ signal }) => {
        const marts = await dataMartService.getDataMarts({ signal, skipLoadingIndicator: true });
        return marts
          .filter(mart => mart.status === DataMartStatus.PUBLISHED)
          .map(mart => ({ id: mart.id, title: mart.title }))
          .sort((a, b) => a.title.localeCompare(b.title));
      },
      staleTime: 30_000,
    });
    // Keep the shared project cache complete; exclusions belong to the current editor.
    return references.filter(reference => reference.id !== currentDataMartId);
  }, [projectId, currentDataMartId, queryClient, user?.projectId, user?.id]);
}
