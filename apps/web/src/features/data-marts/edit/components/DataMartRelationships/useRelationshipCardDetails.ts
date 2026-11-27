import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import type { AxiosRequestConfig } from '../../../../../app/api';
import { dataMartService } from '../../../shared/services/data-mart.service';
import type { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import type { DataMartIconValue } from '../../../shared/enums/data-mart-icon.enum';
import type {
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';
import {
  countRelationships,
  fetchModelCanvasTopology,
  modelCanvasTopologyQueryKey,
} from '../../../model-canvas/model/use-model-canvas';
import { useDataQualitySummaries } from '../../../data-quality/model/use-data-quality-workspace';
import type { RelationshipCardDetails } from './relationship-card';

/** The Data Mart being edited, as its card needs it — known from the edit page. */
export interface RelationshipCardRoot {
  id: string;
  storageId: string;
  icon?: DataMartIconValue | null;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
}

interface TargetDetail {
  definitionType: DataMartDefinitionType | null;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
}

const EMPTY_TARGET_DETAILS = new Map<string, TargetDetail>();

/**
 * What the Joinable Data Marts cards show besides the relationship, in the
 * Models canvas card's terms:
 *
 * - the storage's model (icon, trigger and report counts, Data Last Updated,
 *   relationship count), read from the same cache entry as the Models canvas;
 * - each related Data Mart's detail (input source, sharing), which neither the
 *   relationship payload nor the model list carries;
 * - the Data Quality summaries, polled while a run is active.
 *
 * Every request is silent and non-blocking: the cards render from the
 * relationships alone and gain these facts as they arrive. A card gets its
 * facts only once the storage model has listed its Data Mart, so it never shows
 * a half-loaded footer (a freshness of "Unknown" that is only still loading). A
 * failed request leaves its facts unknown, and an unknown fact shows nothing.
 * Only Data Marts the user can open are asked about.
 *
 * `enabled` should be true only while the diagram is on screen with something
 * to draw — the list view shows none of this, and the storage model is a whole
 * storage's worth of Data Marts. Call `invalidateModel` after changing a
 * relationship, so the relationship counts follow.
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
  refetchQuality: () => Promise<unknown>;
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
      const config = {
        signal,
        skipLoadingIndicator: true,
        skipErrorToast: true,
      } as AxiosRequestConfig;
      const results = await Promise.allSettled(
        targetIds.map(id => dataMartService.getDataMartById(id, config))
      );
      const byId = new Map<string, TargetDetail>();
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const detail = result.value;
        byId.set(targetIds[index], {
          definitionType: detail.definitionType,
          availableForReporting: detail.availableForReporting,
          availableForMaintenance: detail.availableForMaintenance,
        });
      });
      return byId;
    },
    enabled: enabled && targetIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: topology } = useQuery({
    queryKey: modelCanvasTopologyQueryKey(projectId, root.storageId),
    queryFn: ({ signal }) => fetchModelCanvasTopology(root.storageId, signal),
    enabled: enabled && Boolean(root.storageId),
    // The whole storage model is a heavy read for a page visited this often:
    // reuse it for a while and do not reread it on every window focus. A
    // relationship change on this page invalidates it (see `invalidateModel`).
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
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
  const { data: qualitySummaries, refetch: refetchQuality } = useDataQualitySummaries(
    projectId,
    qualityIds
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
    // Until the model is in, a card would show a footer whose freshness only
    // reads "Unknown" because it is still loading — show nothing instead.
    if (!enabled || !topology) return byId;
    const topologyById = new Map(topology.nodes.map(node => [node.id, node]));
    const relationshipCounts = countRelationships(topology.edges);
    for (const id of [root.id, ...targetIds]) {
      const node = topologyById.get(id);
      if (!node) continue;
      const detail = id === root.id ? root : targetDetails.get(id);
      byId.set(id, {
        // The edit page has the root's icon as it is now, maybe newer than the model.
        icon: id === root.id ? (root.icon ?? null) : (node.icon ?? null),
        triggersCount: node.triggersCount,
        reportsCount: node.reportsCount,
        relationshipCount: relationshipCounts.get(id) ?? 0,
        dataLastUpdated: node.dataLastUpdated,
        availableForReporting: detail?.availableForReporting,
        availableForMaintenance: detail?.availableForMaintenance,
        qualitySummary: qualitySummaries?.[id],
      });
    }
    return byId;
  }, [enabled, qualitySummaries, root, targetDetails, targetIds, topology]);

  return { definitionTypes, cardDetails, refetchQuality, invalidateModel };
}
