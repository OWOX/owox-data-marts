import { describe, expect, it } from 'vitest';
import { type DagreLayoutEdge, type DagreLayoutNode, runDagreLayout } from './dagre-layout';

const NODE_W = 240;
const NODE_H = 74;

function cycleFixture(): { nodes: DagreLayoutNode[]; edges: DagreLayoutEdge[] } {
  const nodes: DagreLayoutNode[] = [
    { id: 'a', width: NODE_W, height: NODE_H },
    { id: 'b', width: NODE_W, height: NODE_H },
    { id: 'c', width: NODE_W, height: NODE_H },
    { id: 'isolated', width: NODE_W, height: NODE_H },
  ];
  const labelDims = { width: 250, height: 22 };
  const edges: DagreLayoutEdge[] = [
    { id: 'ab1', sourceId: 'a', targetId: 'b', label: labelDims },
    { id: 'ab2', sourceId: 'a', targetId: 'b', label: labelDims },
    { id: 'bc', sourceId: 'b', targetId: 'c' },
    { id: 'ca', sourceId: 'c', targetId: 'a' },
  ];
  return { nodes, edges };
}

function uniquePositions(positions: Map<string, { x: number; y: number }>): boolean {
  const seen = new Set<string>();
  for (const { x, y } of positions.values()) {
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function nodeRects(nodes: DagreLayoutNode[], positions: Map<string, { x: number; y: number }>) {
  return nodes.map(node => {
    const position = positions.get(node.id);
    if (!position) throw new Error(`missing position for ${node.id}`);
    return {
      left: position.x,
      right: position.x + node.width,
      top: position.y,
      bottom: position.y + node.height,
    };
  });
}

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe.each([
  { direction: 'horizontal' as const, rankdir: 'LR' },
  { direction: 'vertical' as const, rankdir: 'TB' },
])('runDagreLayout ($direction / $rankdir)', ({ direction }) => {
  it('returns empty maps for empty input', () => {
    const result = runDagreLayout([], [], direction);

    expect(result.positions.size).toBe(0);
    expect(result.routes.size).toBe(0);
    expect(result.labelPositions.size).toBe(0);
  });

  it('produces unique, non-overlapping positions for every node', () => {
    const { nodes, edges } = cycleFixture();

    const result = runDagreLayout(nodes, edges, direction);

    expect(result.positions.size).toBe(nodes.length);
    for (const node of nodes) {
      expect(result.positions.has(node.id)).toBe(true);
    }
    expect(uniquePositions(result.positions)).toBe(true);

    const rects = nodeRects(nodes, result.positions);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlap(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it('produces label positions for labeled edges that do not overlap node rects', () => {
    const { nodes, edges } = cycleFixture();

    const result = runDagreLayout(nodes, edges, direction);

    const labeledEdges = edges.filter(edge => edge.label);
    for (const edge of labeledEdges) {
      expect(result.labelPositions.has(edge.id)).toBe(true);
    }

    const rects = nodeRects(nodes, result.positions);
    for (const edge of labeledEdges) {
      const center = result.labelPositions.get(edge.id);
      if (!center) throw new Error(`missing label position for ${edge.id}`);
      const label = edge.label;
      if (!label) throw new Error('expected label dims');
      const labelRect = {
        left: center.x - label.width / 2,
        right: center.x + label.width / 2,
        top: center.y - label.height / 2,
        bottom: center.y + label.height / 2,
      };
      for (const nodeRect of rects) {
        expect(rectsOverlap(labelRect, nodeRect)).toBe(false);
      }
    }
  });

  it('gives parallel edges between the same nodes distinct route signatures', () => {
    const { nodes, edges } = cycleFixture();

    const result = runDagreLayout(nodes, edges, direction);

    const ab1 = result.routes.get('ab1') ?? [];
    const ab2 = result.routes.get('ab2') ?? [];
    const labelAb1 = result.labelPositions.get('ab1');
    const labelAb2 = result.labelPositions.get('ab2');

    const routeSignature = (route: { x: number; y: number }[], label?: { x: number; y: number }) =>
      JSON.stringify({ route: route.map(p => [Math.round(p.x), Math.round(p.y)]), label });

    expect(routeSignature(ab1, labelAb1)).not.toBe(routeSignature(ab2, labelAb2));
  });
});

it('keeps a deep graph renderable when Dagre exhausts the call stack', () => {
  const nodes = Array.from({ length: 2_000 }, (_, index) => ({
    id: `node-${index}`,
    width: NODE_W,
    height: NODE_H,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${index}`,
    sourceId: nodes[index].id,
    targetId: node.id,
  }));

  const result = runDagreLayout(nodes, edges, 'horizontal');

  expect(result.positions.size).toBe(nodes.length);
  expect(uniquePositions(result.positions)).toBe(true);
  for (const position of result.positions.values()) {
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  }
});
