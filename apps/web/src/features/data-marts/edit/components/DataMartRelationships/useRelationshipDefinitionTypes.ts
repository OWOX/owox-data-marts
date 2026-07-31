import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AxiosRequestConfig } from '../../../../../app/api';
import { dataMartService } from '../../../shared/services/data-mart.service';
import type { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import type {
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';

/**
 * Definition types per target data mart id for the relationship diagram.
 * The relationship payload does not carry `definitionType`, so it is fetched
 * from the detail endpoint — non-blocking (cards render with a neutral accent
 * until it arrives) and tolerant of individual failures (403/404 leave the
 * card neutral instead of breaking the diagram).
 *
 * `enabled` should be true only while the diagram is actually visible (graph
 * view) — the detail payloads are heavy and useless to the list view.
 */
export function useRelationshipDefinitionTypes(
  relationshipGraph: RelationshipGraph | null,
  relationships: DataMartRelationship[],
  enabled: boolean
): Map<string, DataMartDefinitionType | null> {
  const targetIds = useMemo(() => {
    const ids = new Set<string>();
    const related = relationshipGraph
      ? relationshipGraph.nodes.map(node => node.relationship.targetDataMart)
      : relationships.map(relationship => relationship.targetDataMart);
    for (const target of related) {
      if (target.userHasAccess) ids.add(target.id);
    }
    return [...ids].sort();
  }, [relationshipGraph, relationships]);

  const { data } = useQuery({
    queryKey: ['relationship-definition-types', targetIds],
    queryFn: async ({ signal }) => {
      const config = {
        signal,
        skipLoadingIndicator: true,
        skipErrorToast: true,
      } as AxiosRequestConfig;
      const results = await Promise.allSettled(
        targetIds.map(id => dataMartService.getDataMartById(id, config))
      );
      const byId = new Map<string, DataMartDefinitionType | null>();
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        byId.set(targetIds[index], result.value.definitionType);
      });
      return byId;
    },
    enabled: enabled && targetIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return data ?? EMPTY_MAP;
}

const EMPTY_MAP = new Map<string, DataMartDefinitionType | null>();
