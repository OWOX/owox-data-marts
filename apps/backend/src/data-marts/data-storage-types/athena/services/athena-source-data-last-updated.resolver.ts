import { Injectable, Logger } from '@nestjs/common';
import {
  SourceDataLastUpdated,
  SourceDataLastUpdatedEntry,
  unavailableSourceDataLastUpdated,
} from '../../../dto/schemas/source-data-last-updated.schema';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  ResolveSourceDataLastUpdatedBatchInput,
  ResolveSourceDataLastUpdatedItem,
  SourceDataLastUpdatedResolver,
} from '../../interfaces/source-data-last-updated-resolver.interface';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { AthenaApiAdapter, AthenaQueryOptions } from '../adapters/athena-api.adapter';
import { AthenaInputTableRef, parseInputTablesFromIoPlan } from '../utils/athena-io-plan.util';
import { athenaTimestampToIsoUtc } from '../utils/athena-timestamp.utils';

/**
 * Athena answers "which tables does this query read" through `EXPLAIN (TYPE IO, FORMAT JSON)`
 * — a structured input-table list with views already expanded by the planner — and "when did
 * the data change" differently per table format:
 *
 * - **Iceberg** tables know exactly: `max(committed_at)` over the table's `$snapshots`
 *   metadata is the last data commit. All Iceberg tables of one lookup are measured in a
 *   single UNION ALL query.
 * - **Hive** tables have no data-change time anywhere in the catalog, and the substitutes the
 *   catalog does have (`transient_lastDdlTime`, the creation time) move on metadata-only
 *   operations — they can be NEWER than the last data change, which the `partial` contract
 *   ("at least as recent as") forbids reporting. Hive sources are therefore declared unknown
 *   with a note. The precise alternative — walking S3 object timestamps under the table
 *   location — is deliberately not done: cost scales with object count, not with the answer's
 *   value.
 * - **Federated catalogs** (anything but `awsdatacatalog`) are not measured; they appear as
 *   unknown sources with a note.
 *
 * Table metadata comes from Athena's own catalog API (`GetTableMetadata`), so no Glue SDK
 * dependency is needed. Per-table conclusions are cached across the batch — a canvas sweep
 * touching the same table through twenty Data Marts classifies and measures it once.
 */
@Injectable()
export class AthenaSourceDataLastUpdatedResolver implements SourceDataLastUpdatedResolver {
  readonly type: DataStorageType = DataStorageType.AWS_ATHENA;
  private readonly logger = new Logger(AthenaSourceDataLastUpdatedResolver.name);

  /**
   * Athena is poll-based; the default 1s interval is tuned for real report queries, but these
   * are tiny metadata statements that finish in well under a second — polling faster keeps a
   * multi-round-trip resolution inside the orchestrator's soft timeout with room to spare.
   */
  private static readonly METADATA_POLL_INTERVAL_MS = 250;

  /** The Glue-backed default catalog; the only one whose tables this resolver can measure. */
  private static readonly DEFAULT_CATALOG = 'awsdatacatalog';

  constructor(private readonly adapterFactory: AthenaApiAdapterFactory) {}

  async resolveForSqlBatch(
    input: ResolveSourceDataLastUpdatedBatchInput
  ): Promise<Map<string, SourceDataLastUpdated>> {
    const { storage, items, signal } = input;
    const results = new Map<string, SourceDataLastUpdated>();

    if (!isAthenaConfig(storage.config) || items.length === 0 || signal?.aborted) {
      return results;
    }
    const outputBucket = storage.config.outputBucket;

    // Built once for the whole batch: credential resolution and client setup are per-storage
    // costs, and a canvas-wide sweep over one storage should pay them once, not per Data Mart.
    const adapter = await this.adapterFactory.createFromStorage(storage);
    const cache = new Map<string, CachedSource>();

    for (const item of items) {
      if (signal?.aborted) {
        // Whatever resolved so far is still useful; the caller treats missing keys as
        // "no new information" rather than as a reset.
        break;
      }
      try {
        results.set(item.key, await this.resolveOne(adapter, outputBucket, item, cache, signal));
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
    adapter: AthenaApiAdapter,
    outputBucket: string,
    item: ResolveSourceDataLastUpdatedItem,
    cache: Map<string, CachedSource>,
    signal?: AbortSignal
  ): Promise<SourceDataLastUpdated> {
    const computedAt = new Date().toISOString();

    const planText = await adapter.getQueryIoPlan(
      item.sql,
      outputBucket,
      item.params,
      this.queryOptions(signal)
    );
    const tables = parseInputTablesFromIoPlan(planText);

    if (tables.length === 0) {
      // Either the query reads no table at all (a constant SELECT) or the IO plan came in a
      // shape the parser does not recognise. Both are "we cannot say" — and the raw plan is
      // logged so a format drift is observable, not silent.
      this.logger.debug(
        `No input tables recognised in IO plan for item ${item.key}: ${planText.slice(0, 500)}`
      );
      return unavailableSourceDataLastUpdated(computedAt);
    }

    const icebergToMeasure: AthenaInputTableRef[] = [];
    for (const ref of tables) {
      if (signal?.aborted) {
        return unavailableSourceDataLastUpdated(computedAt);
      }
      if (!cache.has(refKey(ref))) {
        const classified = await this.classifyTable(adapter, ref, cache);
        if (classified === 'iceberg') {
          icebergToMeasure.push(ref);
        }
      }
    }

    if (icebergToMeasure.length > 0 && !signal?.aborted) {
      await this.measureIcebergTables(adapter, outputBucket, icebergToMeasure, cache, signal);
    }

    const sources: SourceDataLastUpdatedEntry[] = [];
    let anyFailed = false;
    for (const ref of tables) {
      const cached = cache.get(refKey(ref));
      if (!cached || cached === 'dropped-view') {
        // Iceberg tables skipped by an abort have no conclusion yet — leave them out entirely
        // rather than inventing an unknown entry for a table we simply did not get to.
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
   * Decides what a referenced table IS and, for everything except Iceberg, what its entry
   * says. Iceberg tables are only classified here; their measurement is batched separately.
   */
  private async classifyTable(
    adapter: AthenaApiAdapter,
    ref: AthenaInputTableRef,
    cache: Map<string, CachedSource>
  ): Promise<'iceberg' | 'settled'> {
    const key = refKey(ref);
    const name = this.displayName(ref);

    if (!isDefaultCatalog(ref.catalog)) {
      cache.set(key, {
        entry: {
          table: name,
          dataLastUpdatedAt: null,
          note: 'federated catalog — modification time not measured',
        },
        failed: false,
      });
      return 'settled';
    }

    let metadata: Awaited<ReturnType<AthenaApiAdapter['getTableMetadata']>>;
    try {
      // Always the canonical name: the IO plan's `awsdatacatalog$iceberg-aws` variants are
      // engine-internal handles that the catalog API does not know.
      metadata = await adapter.getTableMetadata(
        AthenaSourceDataLastUpdatedResolver.DEFAULT_CATALOG,
        ref.schema,
        ref.table
      );
    } catch (error) {
      this.logger.warn(`Failed to read table metadata for ${name}: ${errorText(error)}`);
      cache.set(key, {
        entry: { table: name, dataLastUpdatedAt: null, note: 'could not read table metadata' },
        failed: true,
      });
      return 'settled';
    }

    if (!metadata) {
      cache.set(key, {
        entry: { table: name, dataLastUpdatedAt: null, note: 'table not found in catalog' },
        failed: false,
      });
      return 'settled';
    }

    if (metadata.tableType === 'VIRTUAL_VIEW') {
      // The IO plan expands views to their base tables; a view surviving here means that did
      // not happen for this query shape. Reporting the view's definition-change time would be
      // exactly the misleading answer this design rejects, so we stay silent — but log it,
      // because we would otherwise never notice.
      this.logger.debug(`IO plan reported unexpanded view ${name}; dropping it from sources.`);
      cache.set(key, 'dropped-view');
      return 'settled';
    }

    if (metadata.parameters['table_type']?.toUpperCase() === 'ICEBERG') {
      return 'iceberg';
    }

    // A Hive table has no data-change time anywhere in the catalog. The tempting substitutes
    // (`transient_lastDdlTime`, the creation time) move on metadata-only operations, so they
    // can be NEWER than the last data change — and the `partial` contract promises consumers a
    // value that is only ever older than the truth ("at least as recent as"). Reporting them
    // would present stale data as fresh; a declared unknown is the only honest answer here.
    cache.set(key, {
      entry: {
        table: name,
        dataLastUpdatedAt: null,
        note: 'Hive table — the catalog does not track data modification time',
      },
      failed: false,
    });
    return 'settled';
  }

  /**
   * One UNION ALL query answers `max(committed_at)` for every Iceberg table of this lookup —
   * each Athena statement costs a full submit-and-poll round trip, so per-table queries would
   * multiply latency for nothing.
   */
  private async measureIcebergTables(
    adapter: AthenaApiAdapter,
    outputBucket: string,
    refs: AthenaInputTableRef[],
    cache: Map<string, CachedSource>,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const rows = await adapter.executeQueryAndGetRows(
        this.buildIcebergSnapshotsQuery(refs),
        outputBucket,
        this.queryOptions(signal)
      );
      this.applySnapshotRows(refs, rows, cache);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (refs.length === 1) {
        this.markSnapshotsFailed(refs[0], cache, error);
        return;
      }
      // The batched query is all-or-nothing: one broken table (dropped between EXPLAIN and
      // now, a per-table authorization denial) would fail every Iceberg table in the sweep.
      // Retrying per table confines the damage to the table that actually caused it.
      this.logger.warn(
        `Batched Iceberg snapshots query failed; retrying per table: ${errorText(error)}`
      );
      for (const ref of refs) {
        if (signal?.aborted) {
          throw error;
        }
        try {
          const rows = await adapter.executeQueryAndGetRows(
            this.buildIcebergSnapshotsQuery([ref]),
            outputBucket,
            this.queryOptions(signal)
          );
          this.applySnapshotRows([ref], rows, cache);
        } catch (tableError) {
          if (signal?.aborted) {
            throw tableError;
          }
          this.markSnapshotsFailed(ref, cache, tableError);
        }
      }
    }
  }

  private applySnapshotRows(
    refs: AthenaInputTableRef[],
    rows: Array<Array<string | null>>,
    cache: Map<string, CachedSource>
  ): void {
    const rawByTable = new Map<string, string | null>(rows.map(row => [row[0] ?? '', row[1]]));

    for (const ref of refs) {
      const raw = rawByTable.get(`${ref.schema}.${ref.table}`) ?? null;
      const time = athenaTimestampToIsoUtc(raw);
      let note: string | undefined;
      if (raw === null) {
        note = 'Iceberg table with no snapshots';
      } else if (time === null) {
        // A value came back but in a shape we do not recognise. That is a format drift, not an
        // empty table — logged so it surfaces, exactly like an unrecognised IO plan would.
        this.logger.warn(
          `Unrecognised Iceberg snapshot timestamp for ${this.displayName(ref)}: ${raw}`
        );
        note = 'unrecognised snapshot timestamp format';
      }

      cache.set(refKey(ref), {
        entry: {
          table: this.displayName(ref),
          dataLastUpdatedAt: time,
          ...(note ? { note } : {}),
        },
        failed: false,
      });
    }
  }

  private markSnapshotsFailed(
    ref: AthenaInputTableRef,
    cache: Map<string, CachedSource>,
    error: unknown
  ): void {
    this.logger.warn(
      `Failed to read Iceberg snapshots for ${this.displayName(ref)}: ${errorText(error)}`
    );
    cache.set(refKey(ref), {
      entry: {
        table: this.displayName(ref),
        dataLastUpdatedAt: null,
        note: 'could not read Iceberg snapshots',
      },
      failed: true,
    });
  }

  private buildIcebergSnapshotsQuery(refs: AthenaInputTableRef[]): string {
    return refs
      .map(ref => {
        const keyLiteral = `${ref.schema}.${ref.table}`.replace(/'/g, "''");
        const from = `${quoteIdentifier(ref.schema)}.${quoteIdentifier(`${ref.table}$snapshots`)}`;
        return (
          `SELECT '${keyLiteral}' AS source_table, ` +
          `CAST(max(committed_at) AS varchar) AS last_committed_at FROM ${from}`
        );
      })
      .join('\nUNION ALL\n');
  }

  /** The default catalog is implied; only federated catalogs are worth naming. */
  private displayName(ref: AthenaInputTableRef): string {
    return isDefaultCatalog(ref.catalog)
      ? `${ref.schema}.${ref.table}`
      : `${ref.catalog}.${ref.schema}.${ref.table}`;
  }

  private queryOptions(signal?: AbortSignal): AthenaQueryOptions {
    return {
      pollIntervalMs: AthenaSourceDataLastUpdatedResolver.METADATA_POLL_INTERVAL_MS,
      signal,
    };
  }
}

/**
 * One table's settled conclusion, shared by every item of the batch. `failed` marks a lookup
 * error that must cap coverage at `partial`.
 */
type CachedSource = { entry: SourceDataLastUpdatedEntry; failed: boolean } | 'dropped-view';

function refKey(ref: AthenaInputTableRef): string {
  return `${ref.catalog ?? ''}\0${ref.schema}\0${ref.table}`;
}

/**
 * Whether the reference points at the Glue-backed default catalog. The IO plan does not print
 * the canonical `awsdatacatalog` name — the live engine reports its internal per-connector
 * handle, e.g. `awsdatacatalog$iceberg-aws` for an Iceberg table — so anything up to an
 * optional `$<connector>` suffix counts as the default catalog.
 */
function isDefaultCatalog(catalog: string | null): boolean {
  if (!catalog) {
    return true;
  }
  const canonical = catalog.split('$', 1)[0].toLowerCase();
  return canonical === 'awsdatacatalog';
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
