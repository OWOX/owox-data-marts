import { useMemo } from 'react';
import type {
  RelationshipGraph,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';

export function useTransientRelationships(graph: RelationshipGraph | null): {
  rows: TransientRelationshipRow[];
  isLoading: boolean;
} {
  const rows = useMemo<TransientRelationshipRow[]>(() => {
    if (!graph) return [];
    return graph.nodes.map(node => ({
      relationship: node.relationship,
      depth: node.depth,
      parentDataMartTitle: node.relationship.sourceDataMart.title,
      sourceDmId: node.relationship.sourceDataMart.id,
      isBlocked: node.isBlocked,
      aliasPath: node.aliasPath,
      rowKey: node.aliasPath,
      isCycleStub: node.isCycleStub,
    }));
  }, [graph]);

  return { rows, isLoading: graph === null };
}
