import { Injectable, Logger } from '@nestjs/common';
import {
  SourceDataLastUpdated,
  SourceDataLastUpdatedEntry,
  unavailableSourceDataLastUpdated,
} from '../../../dto/schemas/source-data-last-updated.schema';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  ResolveSourceDataLastUpdatedBatchInput,
  ResolveSourceDataLastUpdatedItem,
  SourceDataLastUpdatedResolver,
} from '../../interfaces/source-data-last-updated-resolver.interface';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { DatabricksApiAdapter } from '../adapters/databricks-api.adapter';
import { escapeFullyQualifiedIdentifier } from '../utils/databricks-identifier.utils';
import { parseRelationsFromSparkPlan } from '../utils/databricks-plan-relations.util';

/**
 * Databricks answers "which tables does this query read" through `EXPLAIN EXTENDED` — the
 * analyzer expands views down to base-table relations in the textual plan — and "when did
 * the data change" through `DESCRIBE HISTORY` on each Delta table: the commit timestamp of
 * the newest history entry whose operation actually changes data.
 *
 * The history route is chosen deliberately over the two tempting shortcuts. `DESCRIBE
 * DETAIL`'s `lastModified` is documented only as "when the table was last modified", with
 * nothing said about whether OPTIMIZE or VACUUM move it — an undocumented bound cannot back
 * the schema's "at least as recent as" promise. Unity Catalog's
 * `information_schema.tables.last_altered` moves on DDL. History entries, by contrast, carry
 * a documented commit time AND the operation name, so maintenance commits (OPTIMIZE, VACUUM,
 * FSCK) are filtered out by an explicit whitelist of data-changing operations. An operation
 * this resolver does not recognise is ignored — the safe direction: the answer can only get
 * older, never newer, than the truth.
 *
 * History is per table (it cannot be batched), bounded by the table's `logRetentionDuration`
 * (30 days by default) and read with a LIMIT — a table whose last data change is older than
 * what the read window shows degrades to an honest unknown. Non-Delta and external tables
 * have no history at all and degrade the same way. Per-table conclusions are cached across
 * the batch, and the session is closed when the batch ends.
 */
@Injectable()
export class DatabricksSourceDataLastUpdatedResolver implements SourceDataLastUpdatedResolver {
  readonly type: DataStorageType = DataStorageType.DATABRICKS;
  private readonly logger = new Logger(DatabricksSourceDataLastUpdatedResolver.name);

  /**
   * How deep into a table's history to look for a data-changing commit. Aggressively
   * maintained tables interleave OPTIMIZE/VACUUM commits with writes; a window of 100 covers
   * that comfortably while keeping the read bounded for streaming tables with huge histories.
   */
  private static readonly HISTORY_READ_LIMIT = 100;

  /**
   * Delta operation names that change table data. Sourced from the Delta history operation
   * catalog; maintenance operations (OPTIMIZE, VACUUM, FSCK, ANALYZE) are deliberately
   * absent, and unknown names do not count either.
   */
  private static readonly DATA_CHANGING_OPERATIONS = new Set([
    'WRITE',
    'INSERT',
    'DELETE',
    'UPDATE',
    'MERGE',
    'TRUNCATE',
    'RESTORE',
    'COPY INTO',
    'STREAMING UPDATE',
    'CREATE TABLE AS SELECT',
    'REPLACE TABLE AS SELECT',
    'CREATE OR REPLACE TABLE AS SELECT',
    'CLONE',
  ]);

  constructor(private readonly adapterFactory: DatabricksApiAdapterFactory) {}

  async resolveForSqlBatch(
    input: ResolveSourceDataLastUpdatedBatchInput
  ): Promise<Map<string, SourceDataLastUpdated>> {
    const { storage, items, signal } = input;
    const results = new Map<string, SourceDataLastUpdated>();

    if (!isDatabricksConfig(storage.config) || items.length === 0 || signal?.aborted) {
      return results;
    }

    // Built once for the whole batch: credential resolution and session setup are per-storage
    // costs, and a canvas-wide sweep over one storage should pay them once, not per Data Mart.
    const adapter = await this.adapterFactory.createFromStorage(storage);
    const cache = new Map<string, CachedSource>();

    try {
      for (const item of items) {
        if (signal?.aborted) {
          // Whatever resolved so far is still useful; the caller treats missing keys as
          // "no new information" rather than as a reset.
          break;
        }
        try {
          results.set(item.key, await this.resolveOne(adapter, item, cache, signal));
        } catch (error) {
          if (signal?.aborted) {
            break;
          }
          // One broken item (an invalid definition failing its EXPLAIN) must not sink the
          // sweep for every healthy Data Mart on the same storage: skip its key — absent
          // already means "no new information" — and keep measuring the rest.
          this.logger.warn(
            `Data last updated lookup failed for item ${item.key}; skipping: ${errorText(error)}`
          );
        }
      }
    } finally {
      // The adapter owns a dedicated session; without this the sweep leaks one per storage.
      await adapter.destroy().catch(error => {
        this.logger.warn(`Failed to destroy Databricks connection: ${errorText(error)}`);
      });
    }

    return results;
  }

  private async resolveOne(
    adapter: DatabricksApiAdapter,
    item: ResolveSourceDataLastUpdatedItem,
    cache: Map<string, CachedSource>,
    signal?: AbortSignal
  ): Promise<SourceDataLastUpdated> {
    const computedAt = new Date().toISOString();

    const explain = await adapter.executeDryRunQuery(item.sql);
    if (!explain.isValid) {
      throw new Error(explain.error ?? 'EXPLAIN failed');
    }
    const tables = parseRelationsFromSparkPlan(explain.plan);

    if (tables.length === 0) {
      // Either the query reads no table at all (a constant SELECT) or the plan came in a
      // shape the parser does not recognise. Both are "we cannot say" — and the raw plan is
      // logged so a format drift is observable, not silent.
      this.logger.debug(
        `No relations recognised in EXPLAIN output for item ${item.key}: ${explain.plan.slice(0, 500)}`
      );
      return unavailableSourceDataLastUpdated(computedAt);
    }

    for (const table of tables) {
      if (signal?.aborted) {
        break;
      }
      if (!cache.has(table)) {
        cache.set(table, await this.measureTable(adapter, table));
      }
    }

    const sources: SourceDataLastUpdatedEntry[] = [];
    let anyFailed = false;
    for (const table of tables) {
      const cached = cache.get(table);
      if (!cached) {
        // Tables skipped by an abort have no conclusion yet — leave them out entirely rather
        // than inventing an unknown entry for a table we simply did not get to.
        continue;
      }
      sources.push(cached.entry);
      anyFailed = anyFailed || cached.failed;
    }

    if (sources.length === 0) {
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
    // `sources.length < tables.length` covers an abort that lands between the EXPLAIN and the
    // measurement: earlier items' cached tables would otherwise report `complete` over a
    // truncated source set.
    const isPartial =
      anyFailed || resolvedTimes.length < sources.length || sources.length < tables.length;

    return {
      dataLastUpdatedAt,
      computedAt,
      coverage: isPartial ? 'partial' : 'complete',
      sources,
    };
  }

  /**
   * Reads the newest slice of the table's history and takes the first commit whose operation
   * changes data. History is newest-first, so the first match IS the latest data change.
   */
  private async measureTable(adapter: DatabricksApiAdapter, table: string): Promise<CachedSource> {
    let rows: Record<string, unknown>[];
    try {
      rows = await adapter.executeQueryAndFetchAll(this.buildHistoryQuery(table));
    } catch (error) {
      // Typically a non-Delta or external table (history only exists for Delta), a dropped
      // table, or a permission gap. All are per-table conditions; the item stays alive.
      this.logger.warn(`Failed to read table history for ${table}: ${errorText(error)}`);
      return {
        entry: { table, dataLastUpdatedAt: null, note: 'could not read table history' },
        failed: true,
      };
    }

    for (const row of rows) {
      const operation = String(row.OPERATION ?? '').toUpperCase();
      if (!DatabricksSourceDataLastUpdatedResolver.DATA_CHANGING_OPERATIONS.has(operation)) {
        continue;
      }
      const committedAt = row.COMMITTED_AT;
      if (typeof committedAt === 'string' && ISO_UTC_RE.test(committedAt)) {
        return { entry: { table, dataLastUpdatedAt: committedAt }, failed: false };
      }
      // A matching commit whose timestamp we cannot read is a format drift, not an unchanged
      // table — logged so it surfaces.
      this.logger.warn(`Unrecognised history timestamp for ${table}: ${String(committedAt)}`);
      return {
        entry: { table, dataLastUpdatedAt: null, note: 'unrecognised table history value' },
        failed: false,
      };
    }

    return {
      entry: {
        table,
        dataLastUpdatedAt: null,
        note: 'no data changes in the recent table history',
      },
      failed: false,
    };
  }

  /**
   * The timestamp is rendered to ISO-8601 UTC in SQL — `to_utc_timestamp` with the session's
   * own timezone makes the string deterministic regardless of warehouse configuration.
   */
  private buildHistoryQuery(table: string): string {
    const escaped = escapeFullyQualifiedIdentifier(table.split('.'));
    return (
      `SELECT date_format(to_utc_timestamp(timestamp, current_timezone()), ` +
      `"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") AS COMMITTED_AT, operation AS OPERATION ` +
      `FROM (DESCRIBE HISTORY ${escaped} ` +
      `LIMIT ${DatabricksSourceDataLastUpdatedResolver.HISTORY_READ_LIMIT})`
    );
  }
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * One table's settled conclusion, shared by every item of the batch. `failed` marks a lookup
 * error that must cap coverage at `partial`.
 */
type CachedSource = { entry: SourceDataLastUpdatedEntry; failed: boolean };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
