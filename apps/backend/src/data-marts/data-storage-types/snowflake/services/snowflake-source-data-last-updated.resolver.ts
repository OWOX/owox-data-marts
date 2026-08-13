import { Injectable, Logger } from '@nestjs/common';
import {
  SourceDataLastUpdated,
  SourceDataLastUpdatedEntry,
  unavailableSourceDataLastUpdated,
} from '../../../dto/schemas/source-data-last-updated.schema';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  ResolveSourceDataLastUpdatedBatchInput,
  ResolveSourceDataLastUpdatedItem,
  SourceDataLastUpdatedResolver,
} from '../../interfaces/source-data-last-updated-resolver.interface';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { SnowflakeApiAdapter } from '../adapters/snowflake-api.adapter';
import { SnowflakeQueryExplainJsonResponse } from '../interfaces/snowflake-query-explain-json-response';

/**
 * Snowflake answers "which tables does this query read" through `EXPLAIN USING JSON` — the
 * compiler expands views down to base-table scans and reports every scanned object as a
 * fully-qualified name — and "when did the data change" through
 * `SYSTEM$LAST_CHANGE_COMMIT_TIME`, which moves ONLY on DML.
 *
 * That function is chosen deliberately over the tempting `INFORMATION_SCHEMA.TABLES`
 * timestamps: `LAST_ALTERED` also moves on DDL and background maintenance ("even when no rows
 * are affected"), so it can be NEWER than the last data change — which the `partial` contract
 * ("at least as recent as") forbids reporting. The commit time is documented as approximate
 * (clock precision and skew), but it never lies semantically: only writes move it.
 *
 * All tables of one lookup are measured in a single UNION ALL query; a failed batch retries
 * per table so one broken object (an external table, a permission gap) degrades only itself.
 * Per-table conclusions are cached across the batch, and the adapter's dedicated connection is
 * destroyed when the batch ends — Snowflake connections do not clean up after themselves.
 */
@Injectable()
export class SnowflakeSourceDataLastUpdatedResolver implements SourceDataLastUpdatedResolver {
  readonly type: DataStorageType = DataStorageType.SNOWFLAKE;
  private readonly logger = new Logger(SnowflakeSourceDataLastUpdatedResolver.name);

  constructor(private readonly adapterFactory: SnowflakeApiAdapterFactory) {}

  async resolveForSqlBatch(
    input: ResolveSourceDataLastUpdatedBatchInput
  ): Promise<Map<string, SourceDataLastUpdated>> {
    const { storage, items, signal } = input;
    const results = new Map<string, SourceDataLastUpdated>();

    if (!isSnowflakeConfig(storage.config) || items.length === 0 || signal?.aborted) {
      return results;
    }

    // Built once for the whole batch: credential resolution and client setup are per-storage
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
            // The driver surfaces a cancelled statement as a rejection; that is the deadline
            // firing, not a broken item — stop quietly with what we have.
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
      // The adapter owns a dedicated connection; without this the sweep leaks one connection
      // per storage it touches.
      await adapter.destroy().catch(error => {
        this.logger.warn(`Failed to destroy Snowflake connection: ${errorText(error)}`);
      });
    }

    return results;
  }

  private async resolveOne(
    adapter: SnowflakeApiAdapter,
    item: ResolveSourceDataLastUpdatedItem,
    cache: Map<string, CachedSource>,
    signal?: AbortSignal
  ): Promise<SourceDataLastUpdated> {
    const computedAt = new Date().toISOString();

    const plan = await adapter.executeDryRunQuery(item.sql);
    const tables = collectScannedObjects(plan);

    if (tables.length === 0) {
      // Either the query reads no table at all (a constant SELECT) or the plan came in a
      // shape this collector does not recognise. Both are "we cannot say" — logged so a
      // format drift is observable, not silent.
      this.logger.debug(
        `No scanned objects recognised in EXPLAIN output for item ${item.key} (${plan.Operations?.length ?? 0} operation group(s)).`
      );
      return unavailableSourceDataLastUpdated(computedAt);
    }

    const toMeasure = tables.filter(table => !cache.has(table));
    if (toMeasure.length > 0 && !signal?.aborted) {
      await this.measureTables(adapter, toMeasure, cache, signal);
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
    const isPartial = anyFailed || resolvedTimes.length < sources.length;

    return {
      dataLastUpdatedAt,
      computedAt,
      coverage: isPartial ? 'partial' : 'complete',
      sources,
    };
  }

  /**
   * One UNION ALL query answers the change commit time for every table of this lookup — each
   * statement is a full driver round trip, so per-table queries would multiply latency for
   * nothing. A failed batch retries per table, confining the damage to the table that caused
   * it (an external table the function rejects, a permission gap, a table dropped since the
   * EXPLAIN).
   */
  private async measureTables(
    adapter: SnowflakeApiAdapter,
    tables: string[],
    cache: Map<string, CachedSource>,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const rows = await adapter.executeQueryAndFetchAll(this.buildCommitTimeQuery(tables), {
        signal,
      });
      this.applyCommitTimeRows(tables, rows, cache);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (tables.length === 1) {
        this.markFailed(tables[0], cache, error);
        return;
      }
      this.logger.warn(
        `Batched change commit time query failed; retrying per table: ${errorText(error)}`
      );
      for (const table of tables) {
        if (signal?.aborted) {
          throw error;
        }
        try {
          const rows = await adapter.executeQueryAndFetchAll(this.buildCommitTimeQuery([table]), {
            signal,
          });
          this.applyCommitTimeRows([table], rows, cache);
        } catch (tableError) {
          if (signal?.aborted) {
            throw tableError;
          }
          this.markFailed(table, cache, tableError);
        }
      }
    }
  }

  private applyCommitTimeRows(
    tables: string[],
    rows: Record<string, unknown>[],
    cache: Map<string, CachedSource>
  ): void {
    const rawByTable = new Map<string, unknown>(
      rows.map(row => [String(row.SOURCE_TABLE ?? ''), row.LAST_CHANGE])
    );

    for (const table of tables) {
      const raw = rawByTable.get(table);
      const time = nanosEpochToIsoUtc(raw);
      let note: string | undefined;
      if (time === null) {
        if (raw === null || raw === undefined || Number(raw) === 0) {
          // The function returns 0 for a table with no recorded changes (typically one that
          // has never seen DML within the retention of its change metadata).
          note = 'no data changes recorded';
        } else {
          // A value came back but in a shape we do not recognise. That is a format drift, not
          // an unchanged table — logged so it surfaces.
          this.logger.warn(`Unrecognised change commit time for ${table}: ${String(raw)}`);
          note = 'unrecognised change commit time value';
        }
      }

      cache.set(table, {
        entry: {
          table,
          dataLastUpdatedAt: time,
          ...(note ? { note } : {}),
        },
        failed: false,
      });
    }
  }

  private markFailed(table: string, cache: Map<string, CachedSource>, error: unknown): void {
    this.logger.warn(`Failed to read change commit time for ${table}: ${errorText(error)}`);
    cache.set(table, {
      entry: {
        table,
        dataLastUpdatedAt: null,
        note: 'could not read change commit time',
      },
      failed: true,
    });
  }

  private buildCommitTimeQuery(tables: string[]): string {
    return tables
      .map(table => {
        const keyLiteral = table.replace(/'/g, "''");
        const argumentLiteral = quotedFqnArgument(table).replace(/'/g, "''");
        return (
          `SELECT '${keyLiteral}' AS SOURCE_TABLE, ` +
          `SYSTEM$LAST_CHANGE_COMMIT_TIME('${argumentLiteral}') AS LAST_CHANGE`
        );
      })
      .join('\nUNION ALL\n');
  }
}

/**
 * Flattens the EXPLAIN plan into the deduplicated set of scanned objects. Every operation
 * carries an `objects` list; table scans name the fully-qualified base tables the compiler
 * resolved (views already expanded away).
 */
function collectScannedObjects(plan: SnowflakeQueryExplainJsonResponse): string[] {
  const found = new Set<string>();
  for (const group of plan.Operations ?? []) {
    for (const operation of group ?? []) {
      for (const object of operation.objects ?? []) {
        if (object) {
          found.add(object);
        }
      }
    }
  }
  return [...found];
}

/**
 * The function takes an identifier inside a string literal, so unquoted segments would be
 * re-resolved case-insensitively. Quoting each segment preserves the exact names the EXPLAIN
 * plan reported; a name that already carries quotes is passed through untouched.
 */
function quotedFqnArgument(objectName: string): string {
  if (objectName.includes('"')) {
    return objectName;
  }
  return objectName
    .split('.')
    .map(segment => `"${segment}"`)
    .join('.');
}

/**
 * `SYSTEM$LAST_CHANGE_COMMIT_TIME` returns epoch NANOseconds as a NUMBER. Values at that
 * magnitude exceed 2^53, so the driver may hand them over as number, string, or bigint —
 * all are accepted; the sub-millisecond tail the float representation may lose is far below
 * this feature's precision. Non-positive values mean "no changes recorded" and map to null.
 */
function nanosEpochToIsoUtc(value: unknown): string | null {
  let nanos: number;
  if (typeof value === 'number') {
    nanos = value;
  } else if (typeof value === 'bigint') {
    nanos = Number(value);
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    nanos = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isFinite(nanos) || nanos <= 0) {
    return null;
  }
  return new Date(Math.floor(nanos / 1_000_000)).toISOString();
}

/**
 * One table's settled conclusion, shared by every item of the batch. `failed` marks a lookup
 * error that must cap coverage at `partial`.
 */
type CachedSource = { entry: SourceDataLastUpdatedEntry; failed: boolean };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
