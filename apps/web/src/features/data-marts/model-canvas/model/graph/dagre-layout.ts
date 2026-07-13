import dagre from '@dagrejs/dagre';
import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import type { CanvasDirection } from './canvas-direction';
import type { PathPoint } from './rounded-path';

export interface DagreLayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface DagreLayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: { width: number; height: number };
}

export interface DagreLayoutResult {
  positions: Map<string, PathPoint>;
  routes: Map<string, PathPoint[]>;
  labelPositions: Map<string, PathPoint>;
}

const FALLBACK_NODE_GAP = 80;

function buildFallbackPositions(
  nodes: DagreLayoutNode[],
  direction: CanvasDirection
): Map<string, PathPoint> {
  const positions = new Map<string, PathPoint>();
  const columnCount = Math.ceil(Math.sqrt(nodes.length));
  const { maxWidth, maxHeight } = nodes.reduce(
    (size, node) => ({
      maxWidth: Math.max(size.maxWidth, node.width),
      maxHeight: Math.max(size.maxHeight, node.height),
    }),
    { maxWidth: 0, maxHeight: 0 }
  );

  nodes.forEach((node, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const xIndex = direction === 'horizontal' ? column : row;
    const yIndex = direction === 'horizontal' ? row : column;
    positions.set(node.id, {
      x: xIndex * (maxWidth + FALLBACK_NODE_GAP),
      y: yIndex * (maxHeight + FALLBACK_NODE_GAP),
    });
  });

  return positions;
}

export function runDagreLayout(
  nodes: DagreLayoutNode[],
  edges: DagreLayoutEdge[],
  direction: CanvasDirection
): DagreLayoutResult {
  const positions = new Map<string, PathPoint>();
  const routes = new Map<string, PathPoint[]>();
  const labelPositions = new Map<string, PathPoint>();

  if (nodes.length === 0) return { positions, routes, labelPositions };

  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true });
  g.setGraph({ rankdir: direction === 'horizontal' ? 'LR' : 'TB' });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
  }

  for (const edge of edges) {
    const edgeLabel: EdgeLabel = edge.label
      ? { width: edge.label.width, height: edge.label.height, labelpos: 'c' }
      : {};
    g.setEdge(edge.sourceId, edge.targetId, edgeLabel, edge.id);
  }

  try {
    dagre.layout(g);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      positions: buildFallbackPositions(nodes, direction),
      routes,
      labelPositions,
    };
  }

  for (const nodeId of g.nodes()) {
    const n = g.node(nodeId);
    if (n.x === undefined || n.y === undefined) continue;
    positions.set(nodeId, { x: n.x - n.width / 2, y: n.y - n.height / 2 });
  }

  for (const edge of edges) {
    const ed = g.edge({ v: edge.sourceId, w: edge.targetId, name: edge.id });

    const interiorPoints = (ed.points ?? []).slice(1, -1);
    if (interiorPoints.length > 0) routes.set(edge.id, interiorPoints);

    if (ed.x !== undefined && ed.y !== undefined) {
      labelPositions.set(edge.id, { x: ed.x, y: ed.y });
    }
  }

  return { positions, routes, labelPositions };
}
