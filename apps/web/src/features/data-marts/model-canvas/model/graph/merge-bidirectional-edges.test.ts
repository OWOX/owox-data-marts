import { describe, expect, it } from 'vitest';
import type { ModelCanvasEdge } from '../types';
import { mergeBidirectionalEdges } from './merge-bidirectional-edges';

const edge = (
  id: string,
  source: string,
  target: string,
  joinConditions: { sourceFieldName: string; targetFieldName: string }[]
): ModelCanvasEdge => ({ id, sourceDataMartId: source, targetDataMartId: target, joinConditions });

describe('mergeBidirectionalEdges', () => {
  it('merges a fully mirrored pair into one bidirectional edge', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'a', 'b', [{ sourceFieldName: 'x', targetFieldName: 'y' }]),
      edge('e2', 'b', 'a', [{ sourceFieldName: 'y', targetFieldName: 'x' }]),
    ]);
    expect(result).toEqual([
      {
        id: 'e1+e2',
        sourceId: 'a',
        targetId: 'b',
        bidirectional: true,
        joinNotConfigured: false,
        joinConditions: [{ sourceFieldName: 'x', targetFieldName: 'y' }],
      },
    ]);
    expect(result[0].joinConditions).toEqual([{ sourceFieldName: 'x', targetFieldName: 'y' }]);
  });

  it('keeps non-mirrored reverse edges separate', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'a', 'b', [{ sourceFieldName: 'x', targetFieldName: 'y' }]),
      edge('e2', 'b', 'a', [{ sourceFieldName: 'q', targetFieldName: 'x' }]),
    ]);
    expect(result.map(e => e.bidirectional)).toEqual([false, false]);
  });

  it('keeps parallel edges in the same direction separate', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'a', 'b', [{ sourceFieldName: 'x', targetFieldName: 'y' }]),
      edge('e2', 'a', 'b', [{ sourceFieldName: 'z', targetFieldName: 'w' }]),
    ]);
    expect(result).toHaveLength(2);
  });

  it('never merges edges with empty join conditions and flags them', () => {
    const result = mergeBidirectionalEdges([edge('e1', 'a', 'b', []), edge('e2', 'b', 'a', [])]);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.joinNotConfigured)).toBe(true);
  });

  it('never merges self-loops', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'a', 'a', [{ sourceFieldName: 'x', targetFieldName: 'x' }]),
    ]);
    expect(result).toEqual([
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'a',
        bidirectional: false,
        joinNotConfigured: false,
        joinConditions: [{ sourceFieldName: 'x', targetFieldName: 'x' }],
      },
    ]);
  });

  it('mirror match is order-insensitive across multiple conditions', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'a', 'b', [
        { sourceFieldName: 'x', targetFieldName: 'y' },
        { sourceFieldName: 'm', targetFieldName: 'n' },
      ]),
      edge('e2', 'b', 'a', [
        { sourceFieldName: 'n', targetFieldName: 'm' },
        { sourceFieldName: 'y', targetFieldName: 'x' },
      ]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].bidirectional).toBe(true);
  });

  it('rejects duplicate-condition false mirrors (multiset check)', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'a', 'b', [
        { sourceFieldName: 'x', targetFieldName: 'y' },
        { sourceFieldName: 'm', targetFieldName: 'n' },
      ]),
      edge('e2', 'b', 'a', [
        { sourceFieldName: 'y', targetFieldName: 'x' },
        { sourceFieldName: 'y', targetFieldName: 'x' },
      ]),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every(e => !e.bidirectional)).toBe(true);
  });

  it('keeps reverse edges separate when distinct join fields share a delimited key', () => {
    const result = mergeBidirectionalEdges([
      edge('e1', 'left', 'right', [{ sourceFieldName: 'a b', targetFieldName: 'c' }]),
      edge('e2', 'right', 'left', [{ sourceFieldName: 'b c', targetFieldName: 'a' }]),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every(e => !e.bidirectional)).toBe(true);
  });
});
