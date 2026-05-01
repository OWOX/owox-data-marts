import type {
  StorageResourceFilter,
  StorageResourceLeaf,
} from '../../interfaces/storage-resource-browser.interface';

/**
 * Raw table descriptor returned by the BigQuery listing helper, before any wildcard
 * rollup is applied.
 */
export interface RawTableListing {
  id: string;
  datasetId: string;
  type: 'TABLE' | 'VIEW';
  fullyQualifiedName: string;
}

/**
 * BigQuery sharded-table suffix detector.
 *
 * Matches names ending with `_<digits>` where the digit run is 4–8 characters long,
 * covering the three documented BigQuery sharding suffixes: `_YYYY`, `_YYYYMM`, and
 * `_YYYYMMDD`. Anything outside that range is treated as a regular table to keep false
 * positives (e.g. `users_v2`, `report_2024_final`) out of the rollup.
 *
 * NOTE: `(.+)` is greedy so the regex consumes the longest possible prefix; the
 * digits group anchors to `$` so we always pull the trailing shard suffix.
 */
export const GBQ_SHARDED_TABLE_SUFFIX_RE = /^(.+)_(\d{4,8})$/;

/** A wildcard rollup must merge at least this many shards before we surface it. */
export const GBQ_MIN_SHARDS_FOR_WILDCARD = 2;

/**
 * Detects sharded table sets and emits one wildcard rollup per `(dataset, prefix)`.
 *
 * A sharded set is a group of TABLE entries whose names match the
 * {@link GBQ_SHARDED_TABLE_SUFFIX_RE} pattern. A set must contain at least
 * {@link GBQ_MIN_SHARDS_FOR_WILDCARD} shards — a single date-suffixed table is not
 * sufficient evidence of sharding.
 *
 * Each returned `shardIds` entry is the `${datasetId}.${tableId}` key, suitable for
 * exclusion lookups in {@link applyResourceFilter}.
 */
export function buildWildcardRollups(
  rawTables: ReadonlyArray<RawTableListing>,
  projectId: string
): { leaf: StorageResourceLeaf; shardIds: string[] }[] {
  const groups = new Map<string, { datasetId: string; prefix: string; shardIds: string[] }>();
  for (const t of rawTables) {
    if (t.type !== 'TABLE') continue;
    const match = GBQ_SHARDED_TABLE_SUFFIX_RE.exec(t.id);
    if (!match) continue;
    const prefix = match[1];
    if (!prefix) continue;
    const key = `${t.datasetId}\0${prefix}`;
    const shardKey = `${t.datasetId}.${t.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.shardIds.push(shardKey);
    } else {
      groups.set(key, {
        datasetId: t.datasetId,
        prefix,
        shardIds: [shardKey],
      });
    }
  }

  const rollups: { leaf: StorageResourceLeaf; shardIds: string[] }[] = [];
  for (const { datasetId, prefix, shardIds } of groups.values()) {
    if (shardIds.length < GBQ_MIN_SHARDS_FOR_WILDCARD) continue;
    const wildcardId = `${prefix}_*`;
    rollups.push({
      leaf: {
        id: wildcardId,
        groupId: datasetId,
        type: 'TABLE',
        fullyQualifiedName: `${projectId}.${datasetId}.${wildcardId}`,
      },
      shardIds,
    });
  }
  return rollups;
}

/**
 * Applies the public {@link StorageResourceFilter} contract on top of the raw table
 * listing. Sharded tables are detected by {@link buildWildcardRollups} and collapsed
 * into a single wildcard entry per `(dataset, prefix)`; the individual shards never
 * appear in the response.
 *
 * Filter semantics:
 *  - `TABLE_PATTERN` → only wildcard rollups
 *  - `TABLE`         → only non-sharded TABLEs (shards are folded away)
 *  - `VIEW`          → only views
 *  - undefined       → views + non-sharded tables + wildcard rollups
 */
export function applyResourceFilter(
  rawTables: ReadonlyArray<RawTableListing>,
  projectId: string,
  filter?: StorageResourceFilter
): StorageResourceLeaf[] {
  const wildcards = buildWildcardRollups(rawTables, projectId);
  const wildcardShardIds = new Set(wildcards.flatMap(w => w.shardIds));

  if (filter === 'TABLE_PATTERN') {
    return wildcards.map(w => w.leaf);
  }

  const tableLeaves: StorageResourceLeaf[] = [];
  const viewLeaves: StorageResourceLeaf[] = [];
  for (const t of rawTables) {
    const leaf: StorageResourceLeaf = {
      id: t.id,
      groupId: t.datasetId,
      type: t.type,
      fullyQualifiedName: t.fullyQualifiedName,
    };
    if (t.type === 'VIEW') {
      viewLeaves.push(leaf);
      continue;
    }
    if (wildcardShardIds.has(`${t.datasetId}.${t.id}`)) continue;
    tableLeaves.push(leaf);
  }

  if (filter === 'TABLE') return tableLeaves;
  if (filter === 'VIEW') return viewLeaves;
  return [...viewLeaves, ...tableLeaves, ...wildcards.map(w => w.leaf)];
}
