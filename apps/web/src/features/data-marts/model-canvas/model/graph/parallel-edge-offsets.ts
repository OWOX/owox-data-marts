import type { CanvasRenderEdge } from './merge-bidirectional-edges';

const pairKey = (sourceId: string, targetId: string) => [sourceId, targetId].sort().join('->');

export const PARALLEL_EDGE_SPACING = 56;

export function computeParallelEdgeOffsets(
  edges: CanvasRenderEdge[],
  spacing = PARALLEL_EDGE_SPACING
): Map<string, number> {
  const byPair = new Map<string, CanvasRenderEdge[]>();

  for (const edge of edges) {
    if (edge.sourceId === edge.targetId) continue;
    const key = pairKey(edge.sourceId, edge.targetId);
    const list = byPair.get(key);
    if (list) list.push(edge);
    else byPair.set(key, [edge]);
  }

  const offsets = new Map<string, number>();

  for (const edge of edges) {
    if (edge.sourceId === edge.targetId) {
      offsets.set(edge.id, 0);
    }
  }

  for (const group of byPair.values()) {
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const n = ordered.length;
    ordered.forEach((edge, index) => {
      offsets.set(edge.id, (index - (n - 1) / 2) * spacing);
    });
  }

  return offsets;
}
