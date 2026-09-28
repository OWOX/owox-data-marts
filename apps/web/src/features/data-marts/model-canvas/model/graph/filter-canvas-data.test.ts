import { describe, expect, it } from 'vitest';
import { DataMartStatus } from '../../../shared/enums/data-mart-status.enum';
import type { ModelCanvasData } from '../types';
import { filterCanvasData } from './filter-canvas-data';

const node = (id: string, status: DataMartStatus = DataMartStatus.PUBLISHED) => ({
  id,
  title: id,
  status,
  description: null,
  fieldCount: 0,
  qualitySummary: {
    state: 'NEVER_RUN' as const,
    enabledChecks: 1,
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
});

const edge = (id: string, sourceDataMartId: string, targetDataMartId: string) => ({
  id,
  sourceDataMartId,
  targetDataMartId,
  joinConditions: [],
});

const data: ModelCanvasData = {
  nodes: [node('a'), node('b'), node('c', DataMartStatus.DRAFT), node('isolated')],
  edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
};

describe('filterCanvasData', () => {
  it('published keeps only published nodes and drops edges touching removed nodes', () => {
    const result = filterCanvasData(data, 'published', 'all');
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'b', 'isolated']);
    expect(result.edges.map(e => e.id)).toEqual(['e1']);
  });

  it('draft keeps only draft nodes', () => {
    const result = filterCanvasData(data, 'draft', 'all');
    expect(result.nodes.map(n => n.id)).toEqual(['c']);
    expect(result.edges).toEqual([]);
  });

  it('all keeps everything', () => {
    const result = filterCanvasData(data, 'all', 'all');
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(2);
  });

  it('connected drops nodes without remaining edges', () => {
    const result = filterCanvasData(data, 'all', 'connected');
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('unconnected keeps only nodes without edges and returns no edges', () => {
    const result = filterCanvasData(data, 'all', 'unconnected');
    expect(result.nodes.map(n => n.id)).toEqual(['isolated']);
    expect(result.edges).toEqual([]);
  });

  it('unconnected counts a node whose only neighbour is filtered out by status', () => {
    // b–c is the only edge touching c; with drafts hidden, b keeps a–b and
    // stays connected, while c is gone — nothing new becomes unconnected.
    expect(filterCanvasData(data, 'published', 'unconnected').nodes.map(n => n.id)).toEqual([
      'isolated',
    ]);
    // Draft-only view: c's neighbour b is hidden, so c has no edge left.
    expect(filterCanvasData(data, 'draft', 'unconnected').nodes.map(n => n.id)).toEqual(['c']);
  });

  it('connected is evaluated after the status filter', () => {
    const result = filterCanvasData(data, 'published', 'connected');
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(result.edges.map(e => e.id)).toEqual(['e1']);
  });
});
