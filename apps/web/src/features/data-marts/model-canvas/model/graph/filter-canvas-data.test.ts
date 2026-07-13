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

  it('connected is evaluated after the status filter', () => {
    const result = filterCanvasData(data, 'published', 'connected');
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(result.edges.map(e => e.id)).toEqual(['e1']);
  });
});
