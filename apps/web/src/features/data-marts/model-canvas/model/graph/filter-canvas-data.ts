import { DataMartStatus } from '../../../shared/enums/data-mart-status.enum';
import type { ModelCanvasData } from '../types';

export type CanvasStatusFilter = 'published' | 'draft' | 'all';
export type CanvasRelFilter = 'connected' | 'all';

export function filterCanvasData(
  data: ModelCanvasData,
  status: CanvasStatusFilter,
  rel: CanvasRelFilter
): ModelCanvasData {
  const nodes = data.nodes.filter(node => {
    if (status === 'all') return true;
    return status === 'draft'
      ? node.status === DataMartStatus.DRAFT
      : node.status === DataMartStatus.PUBLISHED;
  });

  const visibleIds = new Set(nodes.map(node => node.id));
  const edges = data.edges.filter(
    edge => visibleIds.has(edge.sourceDataMartId) && visibleIds.has(edge.targetDataMartId)
  );

  if (rel === 'connected') {
    const connectedIds = new Set(
      edges.flatMap(edge => [edge.sourceDataMartId, edge.targetDataMartId])
    );
    return { nodes: nodes.filter(node => connectedIds.has(node.id)), edges };
  }

  return { nodes, edges };
}
