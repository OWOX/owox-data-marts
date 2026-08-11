import { Injectable, Logger } from '@nestjs/common';
import {
  SourceDataLastUpdated,
  SourceDataLastUpdatedEntry,
  unavailableSourceDataLastUpdated,
} from '../../../dto/schemas/source-data-last-updated.schema';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  ResolveSourceDataLastUpdatedBatchInput,
  ResolveSourceDataLastUpdatedItem,
  SourceDataLastUpdatedResolver,
} from '../../interfaces/source-data-last-updated-resolver.interface';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftApiAdapter, RedshiftQueryOptions } from '../adapters/redshift-api.adapter';
import {
  materializedViewNameFromBackingTable,
  parseScannedTablesFromPlan,
  RedshiftScannedTableRef,
} from '../utils/redshift-explain-tables.util';

/**
 * Redshift answers "which tables does this query read" through EXPLAIN — the planner has already
 * expanded views down to base-table scans — and "when did each table's data change" through
 * `SHOW TABLES FROM SCHEMA`, the one surface where Redshift reports `last_modified_time`
 * (lagging real writes by up to ~5 minutes; absent entirely on older releases).
 *
 * Two Redshift quirks shape the flow:
 *
 * - EXPLAIN prints local table names WITHOUT their schema, so bare names are mapped back through
 *   the catalog first. A name existing in several schemas is reported as unknown rather than
 *   guessed: `partial` coverage promises a value that is only ever OLDER than the truth, and a
 *   guess could be newer.
 * - Both lookups are per-schema / per-database, so one batch shares their results across items —
 *   a canvas sweep touching twenty Data Marts in one schema pays for that schema once.
 *
 * External (Spectrum) tables scan data that lives outside Redshift; they are listed as unknown
 * sources with a note, mirroring how the BigQuery resolver treats EXTERNAL tables.
 */
@Injectable()
export class RedshiftSourceDataLastUpdatedResolver implements SourceDataLastUpdatedResolver {
  readonly type: DataStorageType = DataStorageType.AWS_REDSHIFT;
  private readonly logger = new Logger(RedshiftSourceDataLastUpdatedResolver.name);

  /**
   * The Data API is poll-based; the default 1s interval is tuned for real report queries, but
   * these are tiny metadata statements that finish in well under a second — polling faster keeps
   * a three-round-trip resolution inside the orchestrator's soft timeout with room to spare.
   */
  private static readonly METADATA_POLL_INTERVAL_MS = 250;

  constructor(private readonly adapterFactory: RedshiftApiAdapterFactory) {}

  async resolveForSqlBatch(
    input: ResolveSourceDataLastUpdatedBatchInput
  ): Promise<Map<string, SourceDataLastUpdated>> {
    const { storage, items, signal } = input;
    const results = new Map<string, SourceDataLastUpdated>();

    if (!isRedshiftConfig(storage.config) || items.length === 0 || signal?.aborted) {
      return results;
    }
    const database = storage.config.database;

    // Built once for the whole batch: credential resolution and client setup are per-storage
    // costs, and a canvas-wide sweep over one storage should pay them once, not per Data Mart.
    const adapter = await this.adapterFactory.createFromStorage(storage);
    const caches: BatchCaches = { schemasByTableName: new Map(), tablesBySchema: new Map() };

    for (const item of items) {
      if (signal?.aborted) {
        // Whatever resolved so far is still useful; the caller treats missing keys as
        // "no new information" rather than as a reset.
        break;
      }
      try {
        results.set(item.key, await this.resolveOne(adapter, database, item, caches, signal));
      } catch (error) {
        if (signal?.aborted) {
          // The poll loop surfaces an abort as a throw; that is the deadline firing, not a
          // broken item — stop quietly with what we have.
          break;
        }
        // One broken item (an invalid definition failing its EXPLAIN) must not sink the sweep
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
    adapter: RedshiftApiAdapter,
    database: string,
    item: ResolveSourceDataLastUpdatedItem,
    caches: BatchCaches,
    signal?: AbortSignal
  ): Promise<SourceDataLastUpdated> {
    const computedAt = new Date().toISOString();

    const plan = await adapter.getQueryPlan(item.sql, this.queryOptions(signal));
    const scanned = parseScannedTablesFromPlan(plan);

    if (scanned.local.length === 0 && scanned.external.length === 0) {
      // Either the query reads no table at all (a constant SELECT) or the plan came in a shape
      // this parser does not recognise. Both are "we cannot say", which is what unavailable
      // means — and the raw plan is logged so an unrecognised shape is observable, not silent.
      this.logger.debug(
        `No table scans recognised in EXPLAIN output for item ${item.key} (${plan.length} plan line(s)).`
      );
      return unavailableSourceDataLastUpdated(computedAt);
    }

    const located = await this.locateLocalTables(adapter, database, scanned.local, caches, signal);

    const sources: SourceDataLastUpdatedEntry[] = [];
    let anyFailed = false;

    for (const miss of located.unresolved) {
      sources.push(miss);
    }

    for (const table of located.resolved) {
      if (signal?.aborted) {
        return unavailableSourceDataLastUpdated(computedAt);
      }
      const entry = await this.resolveTableEntry(adapter, table, caches, signal);
      anyFailed = anyFailed || entry.lookupFailed;
      sources.push(entry.source);
    }

    for (const external of scanned.external) {
      sources.push({
        table: [database, ...external.parts].join('.'),
        dataLastUpdatedAt: null,
        note: 'external table (Spectrum) — data lives outside Redshift, modification time not tracked',
      });
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
   * Turns the schema-less names EXPLAIN prints into concrete `(database, schema, table)`
   * addresses via one catalog query per batch of unseen names. Names the catalog cannot place
   * uniquely become unresolved entries right away — with a note saying why — instead of guesses.
   */
  private async locateLocalTables(
    adapter: RedshiftApiAdapter,
    database: string,
    refs: RedshiftScannedTableRef[],
    caches: BatchCaches,
    signal?: AbortSignal
  ): Promise<{ resolved: LocatedTable[]; unresolved: SourceDataLastUpdatedEntry[] }> {
    const resolved: LocatedTable[] = [];
    const unresolved: SourceDataLastUpdatedEntry[] = [];

    const bareNames: string[] = [];
    for (const ref of refs) {
      if (ref.parts.length === 1 && !caches.schemasByTableName.has(ref.parts[0])) {
        bareNames.push(ref.parts[0]);
      }
    }

    if (bareNames.length > 0) {
      const matches = await adapter.findTablesByName(
        database,
        [...new Set(bareNames)],
        this.queryOptions(signal)
      );
      for (const name of bareNames) {
        caches.schemasByTableName.set(
          name,
          matches.filter(match => match.tableName === name).map(match => match.schemaName)
        );
      }
    }

    for (const ref of refs) {
      if (ref.parts.length >= 2) {
        // EXPLAIN handed us the schema (and possibly the database) itself — nothing to look up.
        const [tableName, schemaName, databaseName = database] = [...ref.parts].reverse();
        resolved.push({ database: databaseName, schema: schemaName, table: tableName });
        continue;
      }

      const name = ref.parts[0];
      const schemas = caches.schemasByTableName.get(name) ?? [];
      if (schemas.length === 1) {
        resolved.push({ database, schema: schemas[0], table: name });
      } else if (schemas.length === 0) {
        unresolved.push({
          table: name,
          dataLastUpdatedAt: null,
          note: `table not found in database ${database} — cannot locate the source table`,
        });
      } else {
        unresolved.push({
          table: name,
          dataLastUpdatedAt: null,
          note: `table name matches ${schemas.length} schemas — cannot identify the source table`,
        });
      }
    }

    return { resolved, unresolved };
  }

  private async resolveTableEntry(
    adapter: RedshiftApiAdapter,
    table: LocatedTable,
    caches: BatchCaches,
    signal?: AbortSignal
  ): Promise<{ source: SourceDataLastUpdatedEntry; lookupFailed: boolean }> {
    const fullName = this.displayName(table);
    const schemaTables = await this.schemaTables(adapter, table, caches, signal);

    if (schemaTables === null) {
      return {
        source: {
          table: fullName,
          dataLastUpdatedAt: null,
          note: 'could not read table metadata',
        },
        lookupFailed: true,
      };
    }

    const lastModifiedTime = schemaTables.get(table.table);
    if (!lastModifiedTime) {
      return {
        source: {
          table: fullName,
          dataLastUpdatedAt: null,
          // Also the honest answer on Redshift releases that predate last_modified_time.
          note: 'no modification time reported by Redshift',
        },
        lookupFailed: false,
      };
    }

    const entry: SourceDataLastUpdatedEntry = {
      table: fullName,
      dataLastUpdatedAt: lastModifiedTime,
    };
    if (materializedViewNameFromBackingTable(table.table)) {
      entry.note = 'materialized view — time of the last refresh';
    }
    return { source: entry, lookupFailed: false };
  }

  /**
   * `SHOW TABLES FROM SCHEMA` for one schema, fetched once per batch. A failed fetch is cached
   * as a failure too: the second Data Mart in the same broken schema should not retry a call
   * that just demonstrated it cannot succeed.
   */
  private async schemaTables(
    adapter: RedshiftApiAdapter,
    table: LocatedTable,
    caches: BatchCaches,
    signal?: AbortSignal
  ): Promise<Map<string, string | null> | null> {
    const key = `${table.database}\0${table.schema}`;
    const cached = caches.tablesBySchema.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let result: Map<string, string | null> | null;
    try {
      const rows = await adapter.getSchemaTablesInfo(
        table.database,
        table.schema,
        this.queryOptions(signal)
      );
      result = new Map(rows.map(row => [row.tableName, row.lastModifiedTime]));
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      this.logger.warn(
        `Failed to read table metadata for schema ${table.database}.${table.schema}: ${errorText(error)}`
      );
      result = null;
    }

    caches.tablesBySchema.set(key, result);
    return result;
  }

  private displayName(table: LocatedTable): string {
    const mvName = materializedViewNameFromBackingTable(table.table);
    return [table.database, table.schema, mvName ?? table.table].join('.');
  }

  private queryOptions(signal?: AbortSignal): RedshiftQueryOptions {
    return {
      pollIntervalMs: RedshiftSourceDataLastUpdatedResolver.METADATA_POLL_INTERVAL_MS,
      signal,
    };
  }
}

interface LocatedTable {
  database: string;
  schema: string;
  table: string;
}

/**
 * Lookup results shared by every item of one batch. Both underlying calls are schema- or
 * database-scoped rather than table-scoped, so their answers are valid for the whole sweep.
 */
interface BatchCaches {
  /** Bare table name → schemas of that name in the storage's database ([] = looked up, absent). */
  schemasByTableName: Map<string, string[]>;
  /** `database\0schema` → table name → ISO modification time; null = the fetch itself failed. */
  tablesBySchema: Map<string, Map<string, string | null> | null>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
