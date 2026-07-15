import { describe, expect, it } from 'vitest';
import type { CanvasRenderEdge } from './merge-bidirectional-edges';
import { computeParallelEdgeOffsets } from './parallel-edge-offsets';

const edge = (
  id: string,
  sourceId: string,
  targetId: string,
  bidirectional = false
): CanvasRenderEdge => ({
  id,
  sourceId,
  targetId,
  bidirectional,
  joinNotConfigured: false,
  joinConditions: [],
});

describe('computeParallelEdgeOffsets', () => {
  it('assigns 0 to a single edge between two marts', () => {
    const offsets = computeParallelEdgeOffsets([edge('e1', 'a', 'b')]);
    expect(offsets.get('e1')).toBe(0);
  });

  it('assigns symmetric offsets to two parallel edges, ordered by id', () => {
    const offsets = computeParallelEdgeOffsets([edge('e2', 'a', 'b'), edge('e1', 'a', 'b')], 28);
    expect(offsets.get('e1')).toBe(-14);
    expect(offsets.get('e2')).toBe(14);
  });

  it('assigns symmetric offsets to three parallel edges, ordered by id', () => {
    const offsets = computeParallelEdgeOffsets(
      [edge('e3', 'a', 'b'), edge('e1', 'a', 'b'), edge('e2', 'a', 'b')],
      28
    );
    expect(offsets.get('e1')).toBe(-28);
    expect(offsets.get('e2')).toBe(0);
    expect(offsets.get('e3')).toBe(28);
  });

  it('groups non-mirrored anti-parallel A->B and B->A into the same corridor', () => {
    const offsets = computeParallelEdgeOffsets([edge('e1', 'a', 'b'), edge('e2', 'b', 'a')], 28);
    expect(offsets.get('e1')).toBe(-14);
    expect(offsets.get('e2')).toBe(14);
  });

  it('applies the default spacing when none is provided', () => {
    const offsets = computeParallelEdgeOffsets([edge('e2', 'a', 'b'), edge('e1', 'a', 'b')]);
    expect(offsets.get('e1')).toBe(-28);
    expect(offsets.get('e2')).toBe(28);
  });

  it('assigns 0 to self-loops regardless of other self-loops', () => {
    const offsets = computeParallelEdgeOffsets([edge('e1', 'a', 'a'), edge('e2', 'a', 'a')]);
    expect(offsets.get('e1')).toBe(0);
    expect(offsets.get('e2')).toBe(0);
  });

  it('lets a merged bidirectional edge participate in its forward-direction group', () => {
    const offsets = computeParallelEdgeOffsets(
      [edge('e1+e2', 'a', 'b', true), edge('e3', 'a', 'b')],
      28
    );
    expect(offsets.get('e1+e2')).toBe(-14);
    expect(offsets.get('e3')).toBe(14);
  });
});
