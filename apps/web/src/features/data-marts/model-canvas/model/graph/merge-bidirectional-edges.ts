import type { ModelCanvasEdge, ModelCanvasJoinCondition } from '../types';

export interface CanvasRenderEdge {
  id: string;
  sourceId: string;
  targetId: string;
  bidirectional: boolean;
  joinNotConfigured: boolean;
  joinConditions: ModelCanvasJoinCondition[];
}

const conditionKey = (source: string, target: string) => JSON.stringify([source, target]);

function conditionsMirror(a: ModelCanvasEdge, b: ModelCanvasEdge): boolean {
  if (a.joinConditions.length === 0 || a.joinConditions.length !== b.joinConditions.length) {
    return false;
  }
  const remaining = new Map<string, number>();
  for (const c of a.joinConditions) {
    const key = conditionKey(c.sourceFieldName, c.targetFieldName);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const c of b.joinConditions) {
    const key = conditionKey(c.targetFieldName, c.sourceFieldName);
    const count = remaining.get(key);
    if (!count) return false;
    remaining.set(key, count - 1);
  }
  return true;
}

export function mergeBidirectionalEdges(edges: ModelCanvasEdge[]): CanvasRenderEdge[] {
  const byPair = new Map<string, ModelCanvasEdge[]>();
  for (const edge of edges) {
    const key = conditionKey(edge.sourceDataMartId, edge.targetDataMartId);
    const list = byPair.get(key);
    if (list) list.push(edge);
    else byPair.set(key, [edge]);
  }

  const consumed = new Set<string>();
  const result: CanvasRenderEdge[] = [];

  for (const edge of edges) {
    if (consumed.has(edge.id)) continue;
    consumed.add(edge.id);

    const isSelfLoop = edge.sourceDataMartId === edge.targetDataMartId;
    const mirror = isSelfLoop
      ? undefined
      : byPair
          .get(conditionKey(edge.targetDataMartId, edge.sourceDataMartId))
          ?.find(candidate => !consumed.has(candidate.id) && conditionsMirror(edge, candidate));

    if (mirror) {
      consumed.add(mirror.id);
      result.push({
        id: [edge.id, mirror.id].sort().join('+'),
        sourceId: edge.sourceDataMartId,
        targetId: edge.targetDataMartId,
        bidirectional: true,
        joinNotConfigured: false,
        joinConditions: edge.joinConditions,
      });
    } else {
      result.push({
        id: edge.id,
        sourceId: edge.sourceDataMartId,
        targetId: edge.targetDataMartId,
        bidirectional: false,
        joinNotConfigured: edge.joinConditions.length === 0,
        joinConditions: edge.joinConditions,
      });
    }
  }

  return result;
}
