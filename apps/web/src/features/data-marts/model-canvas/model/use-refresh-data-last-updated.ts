import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
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
 * previous value. Progress shows on the nodes themselves — every Data Last Updated icon spins
 * while `isRefreshing` is true, the same affordance a RUNNING quality run gets — so success
 * needs no toast: the icons settle into the fresh values. A sweep that changes nothing does
 * speak up, though: on a storage without a resolver "measured nothing" is the guaranteed
 * outcome, and spinning icons that stop with no visible change would read as broken. Failure
 * stays honest too — a partially-failed sweep reports how much it actually covered.
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
          // Without this the no-resolver storages (anything but BigQuery today) would spin
          // every icon and then change nothing, every time — indistinguishable from a bug.
          toast.error(
            anyRequestFailed
              ? 'Failed to check Data Last Updated'
              : "Couldn't measure any of the selected Data Marts — their storage may not support Data Last Updated yet"
          );
          return;
        }

        if (anyRequestFailed) {
          // Part of the sweep failed — without this the nodes that silently kept their
          // previous value would be indistinguishable from freshly-measured ones.
          toast.error(
            `Data Last Updated checked for ${String(measured.size)} of ${String(dataMartIds.length)} data marts — some requests failed`
          );
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
