import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import toast from 'react-hot-toast';
import {
  apiErrorMessage,
  wasErrorToastShown,
  type AxiosRequestConfig,
} from '../../../../../app/api';
import { dataMartService } from '../../../shared/services/data-mart.service';
import type { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import type { DataMartIconValue } from '../../../shared/enums/data-mart-icon.enum';
import type { DataLastUpdatedDto } from '../../../shared/types/api/response/data-mart-data-last-updated.dto';
import type {
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';
import {
  countRelationships,
  fetchModelCanvasTopology,
  modelCanvasTopologyQueryKey,
} from '../../../model-canvas/model/use-model-canvas';
import {
  dataQualityQueryKeys,
  useDataQualitySummaries,
} from '../../../data-quality/model/use-data-quality-workspace';
import { dataQualityService } from '../../../data-quality/api/data-quality.service';
import { dataStorageApiService } from '../../../../data-storage/shared/api';
import type { RelationshipCardDetails } from './relationship-card';

/** The Data Mart being edited, as its card needs it — known from the edit page. */
export interface RelationshipCardRoot {
  id: string;
  storageId: string;
  icon?: DataMartIconValue | null;
  dataLastUpdated?: DataLastUpdatedDto | null;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
}

/** What a related Data Mart's detail says about it, or the edit page about the root. */
interface DataMartFacts {
  icon?: DataMartIconValue | null;
  dataLastUpdated?: DataLastUpdatedDto | null;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
}

interface TargetDetail extends DataMartFacts {
  definitionType: DataMartDefinitionType | null;
}

const EMPTY_TARGET_DETAILS = new Map<string, TargetDetail>();

const SILENT_REQUEST = { skipLoadingIndicator: true, skipErrorToast: true } as const;

/**
 * What the Joinable Data Marts cards show besides the relationship, in the
 * Models canvas card's terms:
 *
 * - each Data Mart's own facts — icon, Data Last Updated, sharing — from the
 *   detail of a related Data Mart (fetched for its input source anyway) or,
 *   for the root, from the edit page;
 * - the Data Quality summaries, polled while a run is active;
 * - the trigger, report and relationship counts, which only the storage model
 *   carries. It is read from the same cache entry as the Models canvas, and only
 *   for a Storage in the user's own list: everyone who can open a Data Mart can
 *   open this diagram, but the model needs access to its Storage. Without it the
 *   cards simply have no counts.
 *
 * Every request is silent and non-blocking: the cards render from the
 * relationships alone and gain these facts as they arrive. A card's facts wait
 * for the quality summaries, so its footer appears once, whole. A failed
 * request leaves its facts unknown, and an unknown fact shows nothing. Only
 * Data Marts the user can open are asked about.
 *
 * `enabled` should be true only while the diagram is on screen with something
 * to draw — the list view and a collapsed block show none of this. Call
 * `invalidateModel` after changing a relationship, so the relationship counts
 * follow.
 */
export function useRelationshipCardDetails({
  root,
  relationshipGraph,
  relationships,
  enabled,
}: {
  root: RelationshipCardRoot;
  relationshipGraph: RelationshipGraph | null;
  relationships: DataMartRelationship[];
  enabled: boolean;
}): {
  definitionTypes: Map<string, DataMartDefinitionType | null>;
  cardDetails: Map<string, RelationshipCardDetails>;
  runQuality: (dataMartId: string) => Promise<void>;
  invalidateModel: () => void;
} {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const targetIds = useMemo(() => {
    const ids = new Set<string>();
    const related = relationshipGraph
      ? relationshipGraph.nodes.map(node => node.relationship.targetDataMart)
      : relationships.map(relationship => relationship.targetDataMart);
    for (const target of related) {
      if (target.userHasAccess && target.id !== root.id) ids.add(target.id);
    }
    return [...ids].sort();
  }, [relationshipGraph, relationships, root.id]);

  const { data: targetDetails = EMPTY_TARGET_DETAILS } = useQuery({
    queryKey: ['relationship-target-details', targetIds],
    queryFn: async ({ signal }) => {
      const config = { signal, ...SILENT_REQUEST } as AxiosRequestConfig;
      const results = await Promise.allSettled(
        targetIds.map(id => dataMartService.getDataMartById(id, config))
      );
      const byId = new Map<string, TargetDetail>();
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const detail = result.value;
        byId.set(targetIds[index], {
          definitionType: detail.definitionType,
          icon: detail.icon ?? null,
          dataLastUpdated: detail.dataLastUpdated,
          availableForReporting: detail.availableForReporting,
          availableForMaintenance: detail.availableForMaintenance,
        });
      });
      return byId;
    },
    enabled: enabled && targetIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // The model endpoints answer 403 for a Storage the user cannot see, so ask
  // only for one in the user's own list — the same check the Models canvas makes.
  const { data: visibleStorageIds } = useQuery({
    queryKey: ['relationship-card-visible-storages', projectId],
    queryFn: async ({ signal }) => {
      const storages = await dataStorageApiService.getDataStorages({
        signal,
        ...SILENT_REQUEST,
      } as AxiosRequestConfig);
      return storages.map(storage => storage.id);
    },
    enabled: enabled && Boolean(root.storageId),
    staleTime: 5 * 60 * 1000,
  });
  const canSeeStorage = visibleStorageIds?.includes(root.storageId) ?? false;

  const { data: topology } = useQuery({
    queryKey: modelCanvasTopologyQueryKey(projectId, root.storageId),
    queryFn: ({ signal }) => fetchModelCanvasTopology(root.storageId, signal),
    enabled: enabled && canSeeStorage,
    // The whole storage model is a heavy read for a page visited this often:
    // reuse it for a while. A relationship change on this page invalidates it
    // (see `invalidateModel`).
    staleTime: 60 * 1000,
  });
  const invalidateModel = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: modelCanvasTopologyQueryKey(projectId, root.storageId),
    });
  }, [queryClient, projectId, root.storageId]);

  const qualityIds = useMemo(
    () => (enabled ? [root.id, ...targetIds] : []),
    [enabled, root.id, targetIds]
  );
  const {
    data: qualitySummaries,
    isFetched: isQualityFetched,
    refetch: refetchQuality,
  } = useDataQualitySummaries(projectId, qualityIds);

  const runQuality = useCallback(
    async (dataMartId: string) => {
      try {
        await dataQualityService.startRun(dataMartId);
      } catch (caught) {
        // A refused run (no right to edit that Data Mart, say) already has its toast.
        if (!wasErrorToastShown(caught)) {
          toast.error(apiErrorMessage(caught, 'Failed to start Data Quality run'));
        }
        return;
      }
      toast.success('Data Quality run queued');
      // The cards poll the summaries; the rest of the page — the Data Quality
      // status on Data Setup, the header — reads this Data Mart's own queries.
      await Promise.all([
        refetchQuality(),
        queryClient.invalidateQueries({
          queryKey: dataQualityQueryKeys.root(projectId, dataMartId),
        }),
      ]);
    },
    [queryClient, projectId, refetchQuality]
  );

  const definitionTypes = useMemo(
    () =>
      new Map(
        [...targetDetails].map(([id, detail]): [string, DataMartDefinitionType | null] => [
          id,
          detail.definitionType,
        ])
      ),
    [targetDetails]
  );

  const cardDetails = useMemo(() => {
    const byId = new Map<string, RelationshipCardDetails>();
    // The footer waits for the quality summaries, so it never grows a shield later.
    if (!enabled || !isQualityFetched) return byId;
    const topologyById = topology ? new Map(topology.nodes.map(node => [node.id, node])) : null;
    const relationshipCounts = topology ? countRelationships(topology.edges) : null;
    for (const id of [root.id, ...targetIds]) {
      const facts: DataMartFacts | undefined = id === root.id ? root : targetDetails.get(id);
      if (!facts) continue;
      const node = topologyById?.get(id);
      byId.set(id, {
        icon: facts.icon ?? null,
        dataLastUpdated: facts.dataLastUpdated ?? null,
        availableForReporting: facts.availableForReporting,
        availableForMaintenance: facts.availableForMaintenance,
        qualitySummary: qualitySummaries?.[id],
        // Only the storage model counts these; without it they stay unknown and show nothing.
        triggersCount: node?.triggersCount,
        reportsCount: node?.reportsCount,
        relationshipCount: node ? (relationshipCounts?.get(id) ?? 0) : undefined,
      });
    }
    return byId;
  }, [enabled, isQualityFetched, qualitySummaries, root, targetDetails, targetIds, topology]);

  return { definitionTypes, cardDetails, runQuality, invalidateModel };
}
