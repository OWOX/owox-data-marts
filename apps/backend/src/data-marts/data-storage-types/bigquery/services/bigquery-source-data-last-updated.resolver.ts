import { Injectable, Logger } from '@nestjs/common';
import {
  SourceDataLastUpdated,
  SourceDataLastUpdatedEntry,
  unavailableSourceDataLastUpdated,
} from '../../../dto/schemas/source-data-last-updated.schema';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  ResolveSourceDataLastUpdatedBatchInput,
  ResolveSourceDataLastUpdatedItem,
  SourceDataLastUpdatedResolver,
} from '../../interfaces/source-data-last-updated-resolver.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryApiAdapter, BigQueryTableReference } from '../adapters/bigquery-api.adapter';
import {
  GBQ_MIN_SHARDS_FOR_WILDCARD,
  GBQ_SHARDED_TABLE_SUFFIX_RE,
} from './bigquery-sharded-tables.util';

/**
 * BigQuery is the only warehouse that answers this question for free and completely: a dry run
 * costs nothing and reports `referencedTables`, which BigQuery has already expanded through
 * views (nested ones included, up to its own 16-level limit). That removes any need to parse
 * SQL or walk view definitions ourselves.
 *
 * Table kinds are decided from live metadata, never guessed from the definition:
 * - TABLE / MATERIALIZED_VIEW / SNAPSHOT — `lastModifiedTime` is when the DATA changed. Used.
 * - VIEW — `lastModifiedTime` is when the DEFINITION changed, which says nothing about data
 *   recency. Dropped entirely (not even listed as a source) to keep the answer free of noise
 *   that an LLM would otherwise be tempted to relay as freshness.
 * - EXTERNAL — the bytes live outside BigQuery, so no modification time exists here. Reported
 *   as a null source with a note, which downgrades coverage to `partial`.
 */
@Injectable()
export class BigQuerySourceDataLastUpdatedResolver implements SourceDataLastUpdatedResolver {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;
  private readonly logger = new Logger(BigQuerySourceDataLastUpdatedResolver.name);

  /**
   * BigQuery stops populating `referencedTables` past roughly this many tables. At exactly the
   * cap we cannot tell a complete list from a truncated one, so we report `partial` and let the
   * consumer treat the timestamp as a lower bound.
   */
  private static readonly REFERENCED_TABLES_CAP = 50;

  /**
   * How many metadata lookups may be in flight at once. Small enough that several concurrent
   * resolutions stay well under BigQuery's per-user API rate limit; large enough that a 50-table
   * query still finishes in a few round trips, hidden behind the query it accompanies.
   */
  private static readonly METADATA_CONCURRENCY = 10;

  /** Table kinds whose `lastModifiedTime` reflects a change to the DATA rather than the schema. */
  private static readonly DATA_BEARING_TYPES = new Set(['TABLE', 'MATERIALIZED_VIEW', 'SNAPSHOT']);

  constructor(private readonly adapterFactory: BigQueryApiAdapterFactory) {}

  async resolveForSqlBatch(
    input: ResolveSourceDataLastUpdatedBatchInput
  ): Promise<Map<string, SourceDataLastUpdated>> {
    const { storage, items, signal } = input;
    const results = new Map<string, SourceDataLastUpdated>();

    if (!isBigQueryConfig(storage.config) || items.length === 0 || signal?.aborted) {
      return results;
    }

    // Built once for the whole batch: credential resolution and client setup are per-storage
    // costs, and a canvas-wide sweep over one storage should pay them once, not per Data Mart.
    const adapter = await this.adapterFactory.createFromStorage(storage, storage.config);

    for (const item of items) {
      if (signal?.aborted) {
        // Whatever resolved so far is still useful; the caller treats missing keys as
        // "no new information" rather than as a reset.
        break;
      }
      try {
        results.set(item.key, await this.resolveOne(adapter, item, signal));
      } catch (error) {
        // One broken item (an invalid definition failing its dry run) must not sink the sweep
        // for every healthy Data Mart on the same storage: skip its key — absent already means
        // "no new information" — and keep measuring the rest.
        this.logger.warn(
          `Data last updated lookup failed for item ${item.key}; skipping: ${errorText(error)}`
        );
      }
    }

    return results;
  }

  private async resolveOne(
    adapter: BigQueryApiAdapter,
    item: ResolveSourceDataLastUpdatedItem,
    signal?: AbortSignal
  ): Promise<SourceDataLastUpdated> {
    const computedAt = new Date().toISOString();
    const { sql, params } = item;

    const { referencedTables } = await adapter.executeDryRunQuery(sql, params);

    // The caller gave up while the dry run was in flight (soft deadline, cancelled run). Stop
    // before the metadata fan-out rather than paying ~50 more calls for an answer nobody reads.
    if (referencedTables.length === 0 || signal?.aborted) {
      // Either the query reads no table at all (a constant SELECT) or BigQuery withheld the
      // list. Both are "we cannot say", which is what unavailable means.
      return unavailableSourceDataLastUpdated(computedAt);
    }

    const truncatedByCap =
      referencedTables.length >= BigQuerySourceDataLastUpdatedResolver.REFERENCED_TABLES_CAP;

    const { singles, shardGroups } = this.groupShardedTables(referencedTables);

    const lookups: (() => Promise<SourceDataLastUpdatedEntry | null>)[] = [
      ...singles.map(table => () => this.resolveSingleTable(adapter, table)),
      ...shardGroups.map(group => () => this.resolveShardGroup(adapter, group)),
    ];

    const { sources, anyFailed, abandoned } = await this.runLookups(lookups, signal);
    if (abandoned) {
      return unavailableSourceDataLastUpdated(computedAt);
    }

    if (sources.length === 0) {
      // Every reference was a view we deliberately dropped. Reporting the view's own
      // definition-change time here would be exactly the misleading answer this design rejects,
      // so we stay silent — but log it, because it means BigQuery did not expand the view to its
      // base tables for this query shape and we would otherwise never notice.
      this.logger.debug(
        `All ${referencedTables.length} referenced table(s) resolved to views; reporting data last updated as unavailable.`
      );
      return unavailableSourceDataLastUpdated(computedAt);
    }

    const resolvedTimes = sources
      .map(source => source.dataLastUpdatedAt)
      .filter((value): value is string => value !== null);

    if (resolvedTimes.length === 0) {
      return { dataLastUpdatedAt: null, computedAt, coverage: 'unavailable', sources };
    }

    // ISO-8601 UTC strings sort lexicographically in chronological order, so a plain max works.
    const dataLastUpdatedAt = resolvedTimes.reduce((a, b) => (a > b ? a : b));
    const isPartial = anyFailed || truncatedByCap || resolvedTimes.length < sources.length;

    return {
      dataLastUpdatedAt,
      computedAt,
      coverage: isPartial ? 'partial' : 'complete',
      sources,
    };
  }

  /**
   * Runs the per-source metadata lookups in bounded batches.
   *
   * A single query can reference the 50-table cap, and several of these resolutions can be in
   * flight at once (a canvas sweep, concurrent MCP queries), so an unbounded fan-out stacks into
   * hundreds of simultaneous calls against one project. Past BigQuery's per-user API rate limit
   * the surplus comes back as errors that this resolver counts as failures — the uncapped burst
   * would therefore also degrade the answer it was trying to produce.
   */
  private async runLookups(
    lookups: (() => Promise<SourceDataLastUpdatedEntry | null>)[],
    signal?: AbortSignal
  ): Promise<{ sources: SourceDataLastUpdatedEntry[]; anyFailed: boolean; abandoned: boolean }> {
    const sources: SourceDataLastUpdatedEntry[] = [];
    let anyFailed = false;

    for (
      let start = 0;
      start < lookups.length;
      start += BigQuerySourceDataLastUpdatedResolver.METADATA_CONCURRENCY
    ) {
      if (signal?.aborted) {
        return { sources, anyFailed, abandoned: true };
      }
      const batch = lookups.slice(
        start,
        start + BigQuerySourceDataLastUpdatedResolver.METADATA_CONCURRENCY
      );
      const settled = await Promise.allSettled(batch.map(run => run()));
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          // A dropped VIEW yields no entry at all.
          if (outcome.value) {
            sources.push(outcome.value);
          }
        } else {
          // One unreadable table must not sink the whole answer — the rest still narrows it down.
          anyFailed = true;
          this.logger.warn(
            `Failed to read BigQuery table metadata for data last updated: ${errorText(outcome.reason)}`
          );
        }
      }
    }

    return { sources, anyFailed, abandoned: false };
  }

  /**
   * Splits referenced tables into standalone tables and sharded sets.
   *
   * BigQuery may report a wildcard query either as the wildcard itself (`events_*`) or as its
   * individual shards, and the behaviour is not something we want to depend on. Both shapes
   * land in the same rollup here: an explicit wildcard always, and any prefix carrying two or
   * more date-suffixed shards. Collapsing also keeps a set of 900 daily shards from becoming
   * 900 metadata calls.
   */
  private groupShardedTables(tables: BigQueryTableReference[]): {
    singles: BigQueryTableReference[];
    shardGroups: ShardGroup[];
  } {
    const groups = new Map<string, ShardGroup>();
    const candidates = new Map<string, BigQueryTableReference[]>();

    for (const table of tables) {
      if (table.tableId.includes('*')) {
        const prefix = table.tableId.slice(0, table.tableId.indexOf('*'));
        const key = groupKey(table.projectId, table.datasetId, prefix);
        groups.set(key, { projectId: table.projectId, datasetId: table.datasetId, prefix });
        continue;
      }

      const match = GBQ_SHARDED_TABLE_SUFFIX_RE.exec(table.tableId);
      const prefix = match?.[1];
      if (!prefix) {
        addTo(candidates, groupKey(table.projectId, table.datasetId, table.tableId), table);
        continue;
      }
      addTo(candidates, groupKey(table.projectId, table.datasetId, `${prefix}_`), table);
    }

    const singles: BigQueryTableReference[] = [];
    for (const [key, grouped] of candidates) {
      const first = grouped[0];
      const isShardSet =
        grouped.length >= GBQ_MIN_SHARDS_FOR_WILDCARD &&
        GBQ_SHARDED_TABLE_SUFFIX_RE.test(first.tableId);
      if (!isShardSet) {
        singles.push(...grouped);
        continue;
      }
      if (!groups.has(key)) {
        const prefix = GBQ_SHARDED_TABLE_SUFFIX_RE.exec(first.tableId)![1];
        groups.set(key, {
          projectId: first.projectId,
          datasetId: first.datasetId,
          prefix: `${prefix}_`,
        });
      }
    }

    return { singles, shardGroups: [...groups.values()] };
  }

  private async resolveSingleTable(
    adapter: BigQueryApiAdapter,
    table: BigQueryTableReference
  ): Promise<SourceDataLastUpdatedEntry | null> {
    const { type, lastModifiedTime } = await adapter.getTableLastModified(table);
    const name = `${table.projectId}.${table.datasetId}.${table.tableId}`;

    if (type === 'VIEW') {
      return null;
    }

    if (type === 'EXTERNAL') {
      return {
        table: name,
        dataLastUpdatedAt: null,
        note: 'external table — data lives outside BigQuery, modification time not tracked',
      };
    }

    if (!lastModifiedTime) {
      return {
        table: name,
        dataLastUpdatedAt: null,
        note: 'no modification time reported by BigQuery',
      };
    }

    const entry: SourceDataLastUpdatedEntry = {
      table: name,
      dataLastUpdatedAt: lastModifiedTime.toISOString(),
    };
    if (type && !BigQuerySourceDataLastUpdatedResolver.DATA_BEARING_TYPES.has(type)) {
      entry.note = `table type ${type} — modification time may not track data changes`;
    }
    return entry;
  }

  private async resolveShardGroup(
    adapter: BigQueryApiAdapter,
    group: ShardGroup
  ): Promise<SourceDataLastUpdatedEntry> {
    const name = `${group.projectId}.${group.datasetId}.${group.prefix}*`;
    const maxLastModified = await adapter.getMaxShardLastModified(
      group.projectId,
      group.datasetId,
      group.prefix
    );

    return {
      table: name,
      dataLastUpdatedAt: maxLastModified ? maxLastModified.toISOString() : null,
      note: 'sharded table set — newest shard',
    };
  }
}

interface ShardGroup {
  projectId: string;
  datasetId: string;
  /** Includes the trailing separator, e.g. `events_`. */
  prefix: string;
}

function groupKey(projectId: string, datasetId: string, prefix: string): string {
  return `${projectId}\0${datasetId}\0${prefix}`;
}

function addTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
