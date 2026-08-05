import { describe, expect, it } from 'vitest';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import type { ModelCanvasNode } from '../model/types';
import { canvasToModelGraph, sanitizeModelGraph } from './model-graph';

function buildNode(overrides: Partial<ModelCanvasNode> & { id: string }): ModelCanvasNode {
  return {
    title: overrides.id,
    status: DataMartStatus.PUBLISHED,
    description: null,
    fieldCount: 0,
    qualitySummary: {
      state: 'NEVER_RUN',
      enabledChecks: 0,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
      dataMartRunId: null,
      lastRunAt: null,
    },
    dataLastUpdated: null,
    ...overrides,
  };
}

function buildEdge(overrides: Partial<CanvasRenderEdge> & { id: string }): CanvasRenderEdge {
  return {
    sourceId: 'a',
    targetId: 'b',
    bidirectional: false,
    joinNotConfigured: false,
    joinConditions: [],
    ...overrides,
  };
}

describe('canvasToModelGraph', () => {
  it('maps nodes and edges into the model.owox.com graph shape', () => {
    const graph = canvasToModelGraph({
      nodes: [
        buildNode({
          id: 'id-orders',
          title: 'Orders',
          definitionType: DataMartDefinitionType.SQL,
          definition: 'SELECT * FROM orders',
          description: 'All orders',
          fields: [
            {
              name: 'order_id',
              alias: 'Order ID',
              type: 'STRING',
              isPrimaryKey: true,
              isHidden: false,
            },
            {
              name: 'total',
              alias: 'total',
              type: 'NUMERIC',
              isPrimaryKey: false,
              isHidden: false,
            },
          ],
        }),
        buildNode({
          id: 'id-customers',
          title: 'Customers',
          status: DataMartStatus.DRAFT,
          definitionType: DataMartDefinitionType.TABLE_PATTERN,
        }),
      ],
      edges: [
        buildEdge({
          id: 'edge-1',
          sourceId: 'id-orders',
          targetId: 'id-customers',
          bidirectional: true,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
        }),
      ],
      positions: new Map([['id-orders', { x: 10, y: 20 }]]),
      storageLabel: 'BigQuery (Common)',
    });

    expect(graph.storageId).toBe('BigQuery (Common)');
    expect(graph.nodes).toEqual([
      {
        key: 'orders',
        title: 'Orders',
        inputSource: 'SQL',
        description: 'All orders',
        definition: 'SELECT * FROM orders',
        schema: [
          { name: 'order_id', type: 'STRING', pk: true, alias: 'Order ID' },
          { name: 'total', type: 'NUMERIC', pk: false },
        ],
        position: { x: 10, y: 20 },
        status: 'created',
      },
      {
        key: 'customers',
        title: 'Customers',
        inputSource: 'TABLE',
        description: undefined,
        definition: null,
        schema: [],
        position: { x: 0, y: 0 },
        status: 'pending',
      },
    ]);
    expect(graph.edges).toEqual([
      {
        id: 'edge-1',
        from: 'orders',
        to: 'customers',
        keys: [{ left: 'customer_id', right: 'id' }],
        bidirectional: true,
      },
    ]);
  });

  it('drops the definition for draft data marts — only published ones export it', () => {
    const graph = canvasToModelGraph({
      nodes: [
        buildNode({
          id: 'id-draft',
          title: 'Draft mart',
          status: DataMartStatus.DRAFT,
          definitionType: DataMartDefinitionType.SQL,
          definition: 'SELECT secret FROM wip',
        }),
        buildNode({
          id: 'id-live',
          title: 'Live mart',
          definitionType: DataMartDefinitionType.TABLE,
          definition: 'project.dataset.live',
        }),
      ],
      edges: [],
      positions: new Map(),
    });
    expect(graph.nodes[0]?.definition).toBeNull();
    expect(graph.nodes[1]?.definition).toBe('project.dataset.live');
  });

  it('de-duplicates keys of same-titled data marts', () => {
    const graph = canvasToModelGraph({
      nodes: [
        buildNode({ id: 'id-1', title: 'Orders' }),
        buildNode({ id: 'id-2', title: 'Orders' }),
      ],
      edges: [],
      positions: new Map(),
    });
    expect(graph.nodes.map(node => node.key)).toEqual(['orders', 'orders-2']);
  });
});

describe('sanitizeModelGraph', () => {
  it('strips storage, ids and statuses before the graph leaves as a file', () => {
    const graph = canvasToModelGraph({
      nodes: [buildNode({ id: 'id-orders', title: 'Orders' })],
      edges: [],
      positions: new Map(),
      storageLabel: 'BigQuery (Common)',
    });
    const sanitized = sanitizeModelGraph(graph);
    expect(sanitized).not.toHaveProperty('storageId');
    expect(sanitized.nodes[0]).toMatchObject({ status: 'pending' });
    expect(sanitized.nodes[0]).not.toHaveProperty('owoxId');
    expect(sanitized.nodes[0]).not.toHaveProperty('definition');
  });
});
