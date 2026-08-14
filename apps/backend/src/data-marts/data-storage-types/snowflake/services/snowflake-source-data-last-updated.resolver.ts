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
 * `SNOWFLAKE.ACCOUNT_USAGE.TABLE_DML_HISTORY`: the START_TIME of the newest hourly window
 * with recorded user DML. That start-of-hour is a documented LOWER bound of the last data
 * change, which is exactly the direction the schema contract requires ("at least as recent
 * as"); the price is hourly granularity and the view's publishing delay of up to ~6 hours.
 *
 * The tempting alternatives both fail the contract, in opposite ways.
 * `INFORMATION_SCHEMA.TABLES.LAST_ALTERED` also moves on DDL and background maintenance
 * ("even when no rows are affected"), so it can sit NEWER than the last data change.
 * `SYSTEM$LAST_CHANGE_COMMIT_TIME` looks perfect — it moves on DML only — but Snowflake
 * defines it as a change-detection token with undocumented precision and skew, explicitly
 * discouraging its use as a timestamp; without a bound, it cannot promise the lower-bound
 * direction either. TABLE_DML_HISTORY records user DML only — background clustering and
 * maintenance are documented as excluded.
 *
 * All tables of one lookup are answered by a single query: ACCOUNT_USAGE.TABLES pins the
 * ACTIVE generation's TABLE_ID (names are reusable across DROP/CREATE OR REPLACE, and the
 * history keeps dropped generations' rows) and the object kind, then the history joins on
 * that id. Materialized and secure views the engine did not expand, external tables,
 * Iceberg tables (whose data can change outside Snowflake, past the DML history), and
 * objects not (yet) visible in the catalog degrade to honest unknowns with notes. Querying
 * ACCOUNT_USAGE needs the connection role to see the SNOWFLAKE database — without that
 * access, sources degrade to unknown as well. Per-table conclusions are cached across the batch, and the adapter's
 * dedicated connection is destroyed when the batch ends — Snowflake connections do not clean
 * up after themselves.
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

    const plan = await adapter.executeDryRunQuery(item.sql, { signal });
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
    // `sources.length < tables.length` covers an abort that lands between EXPLAIN and the
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
   * One query over TABLE_DML_HISTORY answers every table of this lookup. There is no
   * per-table failure mode to isolate — a table without a row simply has no recorded DML —
   * so a query failure (typically the role not seeing the SNOWFLAKE database) marks every
   * asked table as unknown at once.
   */
  private async measureTables(
    adapter: SnowflakeApiAdapter,
    tables: string[],
    cache: Map<string, CachedSource>,
    signal?: AbortSignal
  ): Promise<void> {
    // Names that do not split into a clean DATABASE.SCHEMA.TABLE triple (quoted segments,
    // embedded dots) cannot be matched against the history view's name columns; asking for
    // the rest must not silently drop them.
    const identified = tables.filter(table => splitFqn(table) !== null);
    for (const table of tables) {
      if (splitFqn(table) === null) {
        cache.set(table, {
          entry: {
            table,
            dataLastUpdatedAt: null,
            note: 'cannot identify the source table name',
          },
          failed: false,
        });
      }
    }
    if (identified.length === 0) {
      return;
    }

    try {
      const rows = await adapter.executeQueryAndFetchAll(this.buildDmlHistoryQuery(identified), {
        signal,
      });
      this.applyDmlHistoryRows(identified, rows, cache);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      this.logger.warn(`Failed to read table change history: ${errorText(error)}`);
      for (const table of identified) {
        cache.set(table, {
          entry: {
            table,
            dataLastUpdatedAt: null,
            note: 'could not read table change history',
          },
          failed: true,
        });
      }
    }
  }

  private applyDmlHistoryRows(
    tables: string[],
    rows: Record<string, unknown>[],
    cache: Map<string, CachedSource>
  ): void {
    const rowByTable = new Map<string, Record<string, unknown>>(
      rows.map(row => [String(row.SOURCE_TABLE ?? ''), row])
    );

    for (const table of tables) {
      const row = rowByTable.get(table);
      let time: string | null = null;
      let note: string | undefined;
      if (row === undefined) {
        // Not in the account-usage catalog of live objects: either the table is newer than
        // the catalog's publishing delay, or it is not a catalog object at all.
        note = 'table not found in account usage metadata';
      } else if (String(row.TABLE_TYPE ?? '') !== 'BASE TABLE') {
        // The EXPLAIN objects list is not contractually base-tables-only: a materialized or
        // secure view can survive here, and the DML history cannot answer for it (the view
        // explicitly excludes materialized-view maintenance). An honest unknown with the
        // object's kind beats a fabricated time.
        note = `${String(row.TABLE_TYPE ?? 'non-table object').toLowerCase()} — modification time not measured`;
      } else if (String(row.IS_ICEBERG ?? '').toUpperCase() === 'YES') {
        // Iceberg data can change outside Snowflake (external catalogs), so the DML history
        // may hold only an older Snowflake-side write — reporting it as `complete` would
        // present that stale write as THE last change. Even a present history row is refused.
        note = 'iceberg table — modification time not measured';
      } else if (row.LAST_DML_AT === null || row.LAST_DML_AT === undefined) {
        // A live base table with no recorded user DML within the view's retention (one year).
        note = 'no data changes recorded in the last year';
      } else if (typeof row.LAST_DML_AT === 'string' && ISO_UTC_RE.test(row.LAST_DML_AT)) {
        time = row.LAST_DML_AT;
      } else {
        // A value came back but in a shape we do not recognise. That is a format drift, not
        // an unchanged table — logged so it surfaces.
        this.logger.warn(
          `Unrecognised change history value for ${table}: ${String(row.LAST_DML_AT)}`
        );
        note = 'unrecognised change history value';
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

  /**
   * The catalog view supplies the ACTIVE generation's TABLE_ID (names can be reused across
   * DROP/CREATE OR REPLACE, and the history keeps the old generations' rows), plus the object
   * kind, so non-base-tables are recognised instead of silently unanswered. The history join
   * then runs on TABLE_ID, never on names. MAX(START_TIME) is the start of the newest hourly
   * window with recorded user DML — a guaranteed lower bound of the last data change.
   * Rendered to ISO-8601 UTC in SQL so the driver hands over a deterministic string.
   */
  private buildDmlHistoryQuery(tables: string[]): string {
    const tuples = tables
      .map(table => {
        const [database, schema, name] = splitFqn(table)!;
        const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
        return (
          `(t.TABLE_CATALOG = ${quote(database)} AND t.TABLE_SCHEMA = ${quote(schema)} ` +
          `AND t.TABLE_NAME = ${quote(name)})`
        );
      })
      .join('\n   OR ');

    return (
      `SELECT t.TABLE_CATALOG || '.' || t.TABLE_SCHEMA || '.' || t.TABLE_NAME AS SOURCE_TABLE,\n` +
      `       t.TABLE_TYPE AS TABLE_TYPE,\n` +
      `       t.IS_ICEBERG AS IS_ICEBERG,\n` +
      `       TO_CHAR(CONVERT_TIMEZONE('UTC', MAX(h.START_TIME)), ` +
      `'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') AS LAST_DML_AT\n` +
      `FROM SNOWFLAKE.ACCOUNT_USAGE.TABLES t\n` +
      `LEFT JOIN SNOWFLAKE.ACCOUNT_USAGE.TABLE_DML_HISTORY h ON h.TABLE_ID = t.TABLE_ID\n` +
      `WHERE t.DELETED IS NULL\n` +
      `  AND (${tuples})\n` +
      `GROUP BY 1, 2, 3`
    );
  }
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * The history view stores plain name columns, so only names that are an unquoted
 * DATABASE.SCHEMA.TABLE triple can be matched. Anything else returns null.
 */
function splitFqn(objectName: string): [string, string, string] | null {
  if (objectName.includes('"')) {
    return null;
  }
  const parts = objectName.split('.');
  if (parts.length !== 3 || parts.some(part => part.length === 0)) {
    return null;
  }
  return parts as [string, string, string];
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
 * One table's settled conclusion, shared by every item of the batch. `failed` marks a lookup
 * error that must cap coverage at `partial`.
 */
type CachedSource = { entry: SourceDataLastUpdatedEntry; failed: boolean };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
