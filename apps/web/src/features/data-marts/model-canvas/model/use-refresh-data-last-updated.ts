import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { dataMartService } from '../../shared/services/data-mart.service';
import type { ModelCanvasData } from './types';

/**
 * The canvas "check Data Last Updated for what I see" action from the product meeting: measures
 * every visible Data Mart on demand, free of consumption.
 *
 * One request for the whole sweep, not one per node. The expensive part of a lookup is
 * per-storage — resolving credentials and standing up a warehouse client — and a canvas is
 * already filtered to a single storage, so measuring the set together lets the backend pay that
 * once. It also means one cache write, so the flow graph rebuilds (and re-runs fitView) once
 * rather than flickering per node.
 *
 * Data Marts the backend could not measure are simply absent from the response and keep their
 * previous value; only a wholly failed request surfaces a toast.
 */
export function useRefreshDataLastUpdated(storageId: string | null) {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(
    async (dataMartIds: string[]) => {
      if (dataMartIds.length === 0 || !storageId) return;
      setIsRefreshing(true);
      try {
        const { items } = await dataMartService.refreshDataLastUpdated(dataMartIds);
        if (items.length === 0) return;

        const measured = new Map(items.map(item => [item.dataMartId, item.dataLastUpdated]));
        queryClient.setQueryData<ModelCanvasData>(
          ['model-canvas', projectId, storageId],
          previous =>
            previous && {
              ...previous,
              nodes: previous.nodes.map(node => {
                const fresh = measured.get(node.id);
                return fresh ? { ...node, dataLastUpdated: fresh } : node;
              }),
            }
        );
      } catch {
        toast.error('Failed to check Data Last Updated');
      } finally {
        setIsRefreshing(false);
      }
    },
    [projectId, queryClient, storageId]
  );

  return { refresh, isRefreshing };
}
