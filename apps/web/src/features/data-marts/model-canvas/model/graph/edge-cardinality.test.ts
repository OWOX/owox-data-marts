import { describe, expect, it } from 'vitest';
import { DataMartStatus } from '../../../shared/enums/data-mart-status.enum';
import type { ModelCanvasNode } from '../types';
import { buildPrimaryKeysByNode, computeEdgeCardinality } from './edge-cardinality';
import type { CanvasRenderEdge } from './merge-bidirectional-edges';

function node(id: string, fields?: { name: string; isPrimaryKey: boolean }[]): ModelCanvasNode {
  return {
    id,
    title: id,
    status: DataMartStatus.PUBLISHED,
    description: null,
    fieldCount: fields?.length ?? 0,
    fields: fields?.map(f => ({
      name: f.name,
      alias: f.name,
      type: 'STRING',
      isPrimaryKey: f.isPrimaryKey,
      isHidden: false,
    })),
  };
}

function edge(
  sourceId: string,
  targetId: string,
  joins: [string, string][],
  bidirectional = false
): CanvasRenderEdge {
  return {
    id: `${sourceId}->${targetId}`,
    sourceId,
    targetId,
    bidirectional,
    joinNotConfigured: false,
    joinConditions: joins.map(([sourceFieldName, targetFieldName]) => ({
      sourceFieldName,
      targetFieldName,
    })),
  };
}

describe('buildPrimaryKeysByNode', () => {
  it('collects primary key names only for nodes with enriched fields', () => {
    const map = buildPrimaryKeysByNode([
      node('orders', [
        { name: 'order_id', isPrimaryKey: true },
        { name: 'customer_id', isPrimaryKey: false },
      ]),
      node('no-fields'),
    ]);

    expect(map.get('orders')).toEqual(new Set(['order_id']));
    expect(map.has('no-fields')).toBe(false);
  });
});

describe('computeEdgeCardinality', () => {
  const pks = buildPrimaryKeysByNode([
    node('orders', [
      { name: 'order_id', isPrimaryKey: true },
      { name: 'customer_id', isPrimaryKey: false },
    ]),
    node('customers', [
      { name: 'customer_id', isPrimaryKey: true },
      { name: 'email', isPrimaryKey: false },
    ]),
    node('events', [
      { name: 'session_id', isPrimaryKey: true },
      { name: 'event_ts', isPrimaryKey: true },
      { name: 'customer_id', isPrimaryKey: false },
    ]),
    node('unkeyed', [{ name: 'customer_id', isPrimaryKey: false }]),
    node('unenriched'),
  ]);

  it('returns N:1 when the join covers the target primary key only', () => {
    const result = computeEdgeCardinality(
      edge('orders', 'customers', [['customer_id', 'customer_id']]),
      pks
    );
    expect(result).toBe('N:1');
  });

  it('returns 1:N when the join covers the source primary key only', () => {
    const result = computeEdgeCardinality(
      edge('customers', 'orders', [['customer_id', 'customer_id']]),
      pks
    );
    expect(result).toBe('1:N');
  });

  it('returns 1:1 when the join covers both primary keys', () => {
    const result = computeEdgeCardinality(
      edge('orders', 'orders-copy', [['order_id', 'order_id']]),
      buildPrimaryKeysByNode([
        node('orders', [{ name: 'order_id', isPrimaryKey: true }]),
        node('orders-copy', [{ name: 'order_id', isPrimaryKey: true }]),
      ])
    );
    expect(result).toBe('1:1');
  });

  it('requires the full composite key to be covered', () => {
    expect(
      computeEdgeCardinality(edge('orders', 'events', [['customer_id', 'session_id']]), pks)
    ).toBeNull();
    expect(
      computeEdgeCardinality(
        edge('orders', 'events', [
          ['customer_id', 'session_id'],
          ['order_ts', 'event_ts'],
        ]),
        pks
      )
    ).toBe('N:1');
  });

  it('returns null when neither side is provably unique', () => {
    const result = computeEdgeCardinality(
      edge('orders', 'unkeyed', [['customer_id', 'customer_id']]),
      pks
    );
    expect(result).toBeNull();
  });

  it('returns null when a side lacks enriched field data', () => {
    const result = computeEdgeCardinality(
      edge('orders', 'unenriched', [['customer_id', 'customer_id']]),
      pks
    );
    expect(result).toBeNull();
  });

  it('returns null for edges without join conditions', () => {
    expect(computeEdgeCardinality(edge('orders', 'customers', []), pks)).toBeNull();
  });
});
