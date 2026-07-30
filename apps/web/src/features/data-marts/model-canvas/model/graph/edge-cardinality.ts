import type { ModelCanvasNode } from '../types';
import type { CanvasRenderEdge } from './merge-bidirectional-edges';

export type EdgeCardinality = '1:1' | 'N:1' | '1:N';

/**
 * Primary-key field names per node, for nodes whose fields have been enriched.
 * Nodes without field data are absent so cardinality stays unknown for them.
 */
export function buildPrimaryKeysByNode(nodes: ModelCanvasNode[]): Map<string, Set<string>> {
  const byNode = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (!node.fields) continue;
    byNode.set(node.id, new Set(node.fields.filter(f => f.isPrimaryKey).map(f => f.name)));
  }
  return byNode;
}

function joinCoversPrimaryKey(primaryKeys: Set<string>, joinFields: Set<string>): boolean {
  if (primaryKeys.size === 0) return false;
  for (const key of primaryKeys) {
    if (!joinFields.has(key)) return false;
  }
  return true;
}

/**
 * Infer edge cardinality from declared primary keys: a side is unique when the
 * join covers that mart's full primary key. Returns null when either side lacks
 * enriched field data or neither side is provably unique — better no badge than
 * a guessed one.
 */
export function computeEdgeCardinality(
  edge: CanvasRenderEdge,
  primaryKeysByNode: Map<string, Set<string>>
): EdgeCardinality | null {
  if (edge.joinConditions.length === 0) return null;
  const sourcePks = primaryKeysByNode.get(edge.sourceId);
  const targetPks = primaryKeysByNode.get(edge.targetId);
  if (!sourcePks || !targetPks) return null;

  const sourceJoinFields = new Set(edge.joinConditions.map(c => c.sourceFieldName));
  const targetJoinFields = new Set(edge.joinConditions.map(c => c.targetFieldName));
  const sourceUnique = joinCoversPrimaryKey(sourcePks, sourceJoinFields);
  const targetUnique = joinCoversPrimaryKey(targetPks, targetJoinFields);

  if (sourceUnique && targetUnique) return '1:1';
  if (targetUnique) return 'N:1';
  if (sourceUnique) return '1:N';
  return null;
}
