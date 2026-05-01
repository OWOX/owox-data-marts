import {
  applyResourceFilter,
  buildWildcardRollups,
  GBQ_SHARDED_TABLE_SUFFIX_RE,
} from './bigquery-sharded-tables.util';
import type { RawTableListing } from './bigquery-sharded-tables.util';

const PROJECT = 'owox-alaskevych-d-358411';
const DATASET = 'facebook_local';

function table(id: string, type: 'TABLE' | 'VIEW' = 'TABLE'): RawTableListing {
  return {
    id,
    datasetId: DATASET,
    type,
    fullyQualifiedName: `${PROJECT}.${DATASET}.${id}`,
  };
}

describe('GBQ_SHARDED_TABLE_SUFFIX_RE', () => {
  it.each([
    ['test_sharded_table_20260404', 'test_sharded_table', '20260404'],
    ['events_20240101', 'events', '20240101'],
    ['hits_202401', 'hits', '202401'],
    ['report_2024', 'report', '2024'],
    ['multi_word_table_20240101', 'multi_word_table', '20240101'],
  ])('matches %s as prefix=%s suffix=%s', (input, expectedPrefix, expectedSuffix) => {
    const m = GBQ_SHARDED_TABLE_SUFFIX_RE.exec(input);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(expectedPrefix);
    expect(m![2]).toBe(expectedSuffix);
  });

  it.each([
    'plain_table',
    'no_digits_here',
    'too_short_99',
    'has_999999999_too_long',
    'mixed_2024_v2',
    'trailing_underscore_',
  ])('does not match %s', input => {
    expect(GBQ_SHARDED_TABLE_SUFFIX_RE.exec(input)).toBeNull();
  });
});

describe('buildWildcardRollups', () => {
  it('rolls up the user-reported pair into a single wildcard', () => {
    // Exact case from the bug report.
    const rawTables = [table('test_sharded_table_20260404'), table('test_sharded_table_20260405')];
    const rollups = buildWildcardRollups(rawTables, PROJECT);

    expect(rollups).toHaveLength(1);
    expect(rollups[0].leaf).toEqual({
      id: 'test_sharded_table_*',
      groupId: DATASET,
      type: 'TABLE',
      fullyQualifiedName: `${PROJECT}.${DATASET}.test_sharded_table_*`,
    });
    expect(rollups[0].shardIds).toEqual([
      `${DATASET}.test_sharded_table_20260404`,
      `${DATASET}.test_sharded_table_20260405`,
    ]);
  });

  it('does not roll up a singleton', () => {
    const rollups = buildWildcardRollups([table('lonely_20240101')], PROJECT);
    expect(rollups).toHaveLength(0);
  });

  it('rolls up several independent shard groups', () => {
    const rollups = buildWildcardRollups(
      [
        table('events_20240101'),
        table('events_20240102'),
        table('hits_202401'),
        table('hits_202402'),
        table('plain_table'),
      ],
      PROJECT
    );
    const ids = rollups.map(r => r.leaf.id).sort();
    expect(ids).toEqual(['events_*', 'hits_*']);
  });

  it('ignores VIEW entries even when their names look sharded', () => {
    const rollups = buildWildcardRollups(
      [table('view_20240101', 'VIEW'), table('view_20240102', 'VIEW')],
      PROJECT
    );
    expect(rollups).toHaveLength(0);
  });
});

describe('applyResourceFilter', () => {
  const RAW: RawTableListing[] = [
    table('test_sharded_table_20260404'),
    table('test_sharded_table_20260405'),
    table('plain_table'),
    table('my_view', 'VIEW'),
  ];

  it('unfiltered: returns views + non-sharded tables + wildcards (no individual shards)', () => {
    const result = applyResourceFilter(RAW, PROJECT);
    const ids = result.map(r => r.id).sort();
    expect(ids).toEqual(['my_view', 'plain_table', 'test_sharded_table_*']);
    // Individual shards must be folded away entirely.
    expect(result.some(r => r.id.endsWith('20260404'))).toBe(false);
    expect(result.some(r => r.id.endsWith('20260405'))).toBe(false);
  });

  it('filter=TABLE_PATTERN: returns only the wildcard rollups', () => {
    const result = applyResourceFilter(RAW, PROJECT, 'TABLE_PATTERN');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test_sharded_table_*');
    expect(result[0].fullyQualifiedName).toBe(`${PROJECT}.${DATASET}.test_sharded_table_*`);
  });

  it('filter=TABLE: returns non-sharded tables only (shards still folded)', () => {
    const result = applyResourceFilter(RAW, PROJECT, 'TABLE');
    const ids = result.map(r => r.id);
    expect(ids).toEqual(['plain_table']);
  });

  it('filter=VIEW: returns only views', () => {
    const result = applyResourceFilter(RAW, PROJECT, 'VIEW');
    const ids = result.map(r => r.id);
    expect(ids).toEqual(['my_view']);
  });

  it('handles an SDK that returned a fully-qualified id (project:dataset.table form)', () => {
    // Defensive case: if a table.id ever comes through with the colon-prefixed form,
    // the regex would still match the trailing digits but the `prefix` would carry the
    // dataset path. The shard would still be folded into a wildcard rollup keyed by that
    // stretched prefix, so the user would not see "missing tables".
    const stretched: RawTableListing = {
      id: `${PROJECT}:${DATASET}.test_sharded_table_20260404`,
      datasetId: DATASET,
      type: 'TABLE',
      fullyQualifiedName: `${PROJECT}.${DATASET}.${PROJECT}:${DATASET}.test_sharded_table_20260404`,
    };
    const stretched2: RawTableListing = {
      id: `${PROJECT}:${DATASET}.test_sharded_table_20260405`,
      datasetId: DATASET,
      type: 'TABLE',
      fullyQualifiedName: `${PROJECT}.${DATASET}.${PROJECT}:${DATASET}.test_sharded_table_20260405`,
    };
    const result = applyResourceFilter([stretched, stretched2], PROJECT);
    // Should still produce some output (either two singletons or one wildcard).
    expect(result.length).toBeGreaterThan(0);
  });
});
