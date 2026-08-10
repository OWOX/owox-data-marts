import { describe, expect, it } from 'vitest';
import type {
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';
import { filterTransientRows, parseRelationshipStatusFilter } from './relationship-filters';

function buildRow(
  aliasPath: string,
  { status = 'PUBLISHED', isCycleStub = false }: { status?: string; isCycleStub?: boolean } = {}
): TransientRelationshipRow {
  const alias = aliasPath.split('.').pop() ?? aliasPath;
  const relationship: DataMartRelationship = {
    id: `rel-${aliasPath}`,
    dataStorageId: 'storage-1',
    sourceDataMart: { id: 'source-1', title: 'Source', status: 'PUBLISHED', userHasAccess: true },
    targetDataMart: { id: `dm-${alias}`, title: `DM ${alias}`, status, userHasAccess: true },
    targetAlias: alias,
    joinConditions: [],
    createdById: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    modifiedAt: '2026-08-01T00:00:00.000Z',
  };
  return {
    relationship,
    depth: aliasPath.split('.').length,
    parentDataMartTitle: 'Source',
    sourceDmId: 'source-1',
    isBlocked: false,
    aliasPath,
    rowKey: aliasPath,
    isCycleStub,
  };
}

const paths = (rows: TransientRelationshipRow[]) => rows.map(row => row.aliasPath);

describe('filterTransientRows', () => {
  it('returns every row when no filter is active', () => {
    const rows = [buildRow('a'), buildRow('b', { status: 'DRAFT' }), buildRow('a.c')];
    expect(filterTransientRows(rows, { showLooped: true, statusFilter: 'all' })).toEqual(rows);
  });

  it('hides cycle stubs unless showLooped is on', () => {
    const rows = [buildRow('a'), buildRow('a.loop', { isCycleStub: true })];

    expect(paths(filterTransientRows(rows, { showLooped: false, statusFilter: 'all' }))).toEqual([
      'a',
    ]);
    expect(paths(filterTransientRows(rows, { showLooped: true, statusFilter: 'all' }))).toEqual([
      'a',
      'a.loop',
    ]);
  });

  it('filters rows by target status', () => {
    const rows = [buildRow('a'), buildRow('b', { status: 'DRAFT' })];

    expect(
      paths(filterTransientRows(rows, { showLooped: false, statusFilter: 'PUBLISHED' }))
    ).toEqual(['a']);
    expect(paths(filterTransientRows(rows, { showLooped: false, statusFilter: 'DRAFT' }))).toEqual([
      'b',
    ]);
  });

  it('drops the whole subtree of a filtered-out row, like the diagram does', () => {
    const rows = [
      buildRow('a', { status: 'DRAFT' }),
      buildRow('a.b'),
      buildRow('a.b.c'),
      buildRow('d'),
    ];

    // 'a.b' and 'a.b.c' are published, but only reachable through the hidden draft 'a'.
    expect(
      paths(filterTransientRows(rows, { showLooped: false, statusFilter: 'PUBLISHED' }))
    ).toEqual(['d']);
  });

  it('does not treat sibling alias prefixes as ancestors', () => {
    // 'ab' starts with 'a' as a string but is not its child.
    const rows = [buildRow('a', { status: 'DRAFT' }), buildRow('ab')];

    expect(
      paths(filterTransientRows(rows, { showLooped: false, statusFilter: 'PUBLISHED' }))
    ).toEqual(['ab']);
  });
});

describe('parseRelationshipStatusFilter', () => {
  it('accepts the known statuses and falls back to all', () => {
    expect(parseRelationshipStatusFilter('PUBLISHED')).toBe('PUBLISHED');
    expect(parseRelationshipStatusFilter('DRAFT')).toBe('DRAFT');
    expect(parseRelationshipStatusFilter('garbage')).toBe('all');
    expect(parseRelationshipStatusFilter(null)).toBe('all');
  });
});
