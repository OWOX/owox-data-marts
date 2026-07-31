import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { dataMartService } from '../../shared/services/data-mart.service';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';
import type { ModelCanvasTopologyData } from './types';

/**
 * The refresh endpoint validates `ids` with `@ArrayMaxSize(200)`, while the canvas pages up to
 * 1000 nodes — so a large sweep must go out as sequential chunks or the whole request is
 * rejected with a 400. Keep this in sync with the server-side cap in
 * `refresh-data-mart-data-last-updated-request-api.dto.ts`.
 */
const REFRESH_IDS_PER_REQUEST = 200;

/**
 * The canvas "check Data Last Updated for what I see" action from the product meeting: measures
 * every visible Data Mart on demand, free of consumption.
 *
 * Chunked requests, not one per node. The expensive part of a lookup is per-storage — resolving
 * credentials and standing up a warehouse client — and a canvas is already filtered to a single
 * storage, so batching lets the backend pay that once per chunk instead of once per Data Mart.
 * Results are applied to the cache in ONE write after the last chunk, so the flow graph rebuilds
 * (and re-runs fitView) once rather than flickering per chunk.
 *
 * Data Marts the backend could not measure are simply absent from the response and keep their
 * previous value; a toast appears only when the sweep produced nothing at all.
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
        const measured = new Map<string, DataLastUpdatedDto>();
        let anyRequestFailed = false;

        // Sequential on purpose: each chunk is already measured in parallel server-side, and
        // overlapping sweeps would stack warehouse metadata calls toward rate limits.
        for (let start = 0; start < dataMartIds.length; start += REFRESH_IDS_PER_REQUEST) {
          const chunk = dataMartIds.slice(start, start + REFRESH_IDS_PER_REQUEST);
          try {
            const { items } = await dataMartService.refreshDataLastUpdated(chunk);
            for (const item of items) {
              measured.set(item.dataMartId, item.dataLastUpdated);
            }
          } catch {
            // A failed chunk must not discard what the other chunks measured.
            anyRequestFailed = true;
          }
        }

        if (measured.size === 0) {
          if (anyRequestFailed) {
            toast.error('Failed to check Data Last Updated');
          }
          return;
        }

        queryClient.setQueryData<ModelCanvasTopologyData>(
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
      } finally {
        setIsRefreshing(false);
      }
    },
    [projectId, queryClient, storageId]
  );

  return { refresh, isRefreshing };
}
