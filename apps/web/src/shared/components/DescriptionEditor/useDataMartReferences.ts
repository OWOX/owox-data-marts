import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../../../features/idp/hooks/useAuthState';
import { dataMartService } from '../../../features/data-marts/shared/services/data-mart.service';
import { DataMartStatus } from '../../../features/data-marts/shared/enums/data-mart-status.enum';
import type { DataMartFieldReference, DataMartReference } from './data-mart-mentions';
import { flattenNativeFields } from '../../../features/data-marts/shared/utils/flatten-native-fields';

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
          .map(mart => ({ id: mart.id, title: mart.title, icon: mart.icon }))
          .sort((a, b) => a.title.localeCompare(b.title));
      },
      staleTime: 30_000,
    });
    // Keep the shared project cache complete; exclusions belong to the current editor.
    return references.filter(reference => reference.id !== currentDataMartId);
  }, [projectId, currentDataMartId, queryClient, user?.projectId, user?.id]);
}

/**
 * Published Data Marts of one Storage — the ones a SQL Data Mart's query can reference. A
 * reference cannot cross Storages, so the list is filtered by the backend, not here.
 */
export function useStorageDataMartReferences(
  projectId: string,
  storageId: string,
  currentDataMartId?: string
): () => Promise<DataMartReference[]> {
  const queryClient = useQueryClient();
  const user = useUser();
  return useCallback(async () => {
    if (!projectId || user?.projectId !== projectId) return [];
    const references = await queryClient.query({
      queryKey: ['storage-data-mart-references', projectId, user.id, storageId],
      queryFn: async ({ signal }) => {
        const marts = await dataMartService.getDataMarts(
          { signal, skipLoadingIndicator: true },
          { storageId }
        );
        return marts
          .filter(mart => mart.status === DataMartStatus.PUBLISHED)
          .map(mart => ({ id: mart.id, title: mart.title, icon: mart.icon }))
          .sort((a, b) => a.title.localeCompare(b.title));
      },
      staleTime: 30_000,
    });
    return references.filter(reference => reference.id !== currentDataMartId);
  }, [projectId, storageId, currentDataMartId, queryClient, user?.projectId, user?.id]);
}

export function useDataMartFieldReferences(projectId: string) {
  const queryClient = useQueryClient();
  const user = useUser();
  const loadReferences = useDataMartReferences(projectId);
  return useCallback(
    async (id: string): Promise<DataMartFieldReference[]> => {
      if (!projectId || user?.projectId !== projectId) return [];
      // Only drill into a published mart offered by the current user's project catalog.
      if (!(await loadReferences()).some(reference => reference.id === id)) return [];
      return queryClient.query({
        queryKey: ['description-data-mart-fields', projectId, user.id, id],
        queryFn: async ({ signal }) => {
          const mart = await dataMartService.getDataMartById(id, {
            signal,
            skipLoadingIndicator: true,
          });
          if (mart.status !== DataMartStatus.PUBLISHED) return [];
          return flattenNativeFields(mart.schema?.fields ?? []).map(field => ({
            name: field.name,
            alias: field.alias?.trim() ? field.alias.trim() : field.name,
            calculated: Boolean(field.calculated),
          }));
        },
        // Reopening the picker should reflect aliases and fields just edited in the schema.
        staleTime: 0,
      });
    },
    [projectId, user?.projectId, user?.id, queryClient, loadReferences]
  );
}
