import { Inject, Injectable, Logger } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { SOURCE_DATA_LAST_UPDATED_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  ResolveSourceDataLastUpdatedItem,
  SourceDataLastUpdatedResolver,
} from '../data-storage-types/interfaces/source-data-last-updated-resolver.interface';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import {
  SourceDataLastUpdated,
  unavailableSourceDataLastUpdated,
} from '../dto/schemas/source-data-last-updated.schema';

/**
 * Computes `Data Last Updated` for a run as a SEPARATE, free, best-effort lookup, mirroring how
 * {@link ReportTotalsService} computes the totals row: callers start it alongside the rows read
 * so its latency hides behind the query that is running anyway.
 *
 * It is deliberately decoupled from the report reader. That keeps it usable on its own — for a
 * future "refresh what I see" button on the canvas, which must produce this metadata WITHOUT
 * reading any data and WITHOUT registering consumption.
 *
 * Nothing here is cached: a stale answer to "how fresh is this?" is worse than a slow one, and
 * the whole point of computing it per run is that it costs nothing extra to be current.
 */
@Injectable()
export class SourceDataLastUpdatedService {
  private readonly logger = new Logger(SourceDataLastUpdatedService.name);

  /**
   * Ceiling on how long this metadata may hold up a response it is not essential to. A dry run
   * plus metadata calls normally finish in well under two seconds; past this we return
   * `unavailable` and let the rows go out on time.
   */
  static readonly DEFAULT_SOFT_TIMEOUT_MS = 15_000;

  constructor(
    @Inject(SOURCE_DATA_LAST_UPDATED_RESOLVER)
    private readonly resolverRegistry: TypeResolver<DataStorageType, SourceDataLastUpdatedResolver>,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade
  ) {}

  /**
   * Measures against the Data Mart's OWN definition — the scope whose result is safe to persist
   * as the Data Mart's last-known value. Used by run paths for non-blended runs, where the run's
   * source set equals the definition's (output controls only narrow rows, never widen sources).
   *
   * An unbuildable definition (draft mid-edit, unsupported storage) degrades to `unavailable`
   * like any other miss.
   */
  async resolveForDefinition(input: {
    dataMart: Pick<DataMart, 'id' | 'storage' | 'definitionType' | 'definition'>;
    signal?: AbortSignal;
    softTimeoutMs?: number;
  }): Promise<SourceDataLastUpdated> {
    const { dataMart } = input;
    if (!dataMart.definitionType || !dataMart.definition) {
      return unavailableSourceDataLastUpdated();
    }

    let sql: string;
    let params: SqlParameter[] | undefined;
    try {
      const built = await this.queryBuilderFacade.buildQuery(
        dataMart.storage.type,
        dataMart.definition
      );
      sql = typeof built === 'string' ? built : built.sql;
      params = typeof built === 'string' ? undefined : built.params;
    } catch (error) {
      this.logger.warn(
        `Could not build source query for data mart ${dataMart.id}; reporting unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return unavailableSourceDataLastUpdated();
    }

    return this.resolveForSql({
      storage: dataMart.storage,
      sql,
      params,
      signal: input.signal,
      softTimeoutMs: input.softTimeoutMs,
    });
  }

  /**
   * Never rejects. Every failure mode — no resolver for the storage, warehouse error, timeout,
   * cancelled run — becomes `coverage: 'unavailable'` with a null timestamp, because a declared
   * unknown is a usable answer and an exception here would endanger a successful read.
   */
  async resolveForSql(input: {
    storage: DataStorage;
    sql: string;
    params?: SqlParameter[];
    signal?: AbortSignal;
    softTimeoutMs?: number;
  }): Promise<SourceDataLastUpdated> {
    const key = 'single';
    const results = await this.resolveForSqlBatch({
      storage: input.storage,
      items: [{ key, sql: input.sql, params: input.params }],
      signal: input.signal,
      softTimeoutMs: input.softTimeoutMs,
    });
    return results.get(key) ?? unavailableSourceDataLastUpdated();
  }

  /**
   * Resolves many queries that share one storage in a single pass, so the resolver stands up its
   * warehouse client once for the whole batch.
   *
   * Keys absent from the returned map were not resolved (timeout, cancellation, unsupported
   * storage). Callers must treat a missing key as "no new information" and keep whatever value
   * they already had — never as an instruction to clear it.
   */
  async resolveForSqlBatch(input: {
    storage: DataStorage;
    items: ResolveSourceDataLastUpdatedItem[];
    signal?: AbortSignal;
    softTimeoutMs?: number;
  }): Promise<Map<string, SourceDataLastUpdated>> {
    const softTimeoutMs =
      input.softTimeoutMs ?? SourceDataLastUpdatedService.DEFAULT_SOFT_TIMEOUT_MS;

    if (input.items.length === 0) {
      return new Map();
    }

    const resolver = await this.resolverRegistry
      .tryResolve(input.storage.type)
      .catch(() => undefined);
    if (!resolver) {
      // Expected for storages whose implementation has not landed yet — debug, not warn.
      this.logger.debug(
        `No Data Last Updated resolver for storage ${input.storage.type}; reporting unavailable.`
      );
      return new Map();
    }

    // Own controller so the soft deadline can stop the work, while still following the caller's
    // signal (run cancelled / client gone).
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    input.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (input.signal?.aborted) {
      controller.abort();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // On the deadline the timer aborts the controller and resolves to an EMPTY map, which the
      // caller reads as "nothing new" and so keeps every previous value. The resolver observes
      // the same abort and stops between items, so a timed-out batch does not keep burning
      // warehouse calls for a response that has already gone out.
      const deadline = new Promise<Map<string, SourceDataLastUpdated>>(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          this.logger.warn(
            `Data Last Updated lookup exceeded ${softTimeoutMs}ms for storage ${input.storage.type}; reporting unavailable.`
          );
          resolve(new Map());
        }, softTimeoutMs);
      });

      // The call is inside the async wrapper, not just its rejection: a resolver that throws
      // SYNCHRONOUSLY would otherwise escape past `.catch` and break the never-rejects contract
      // that callers rely on to keep this off their critical path.
      const work = (async () =>
        resolver.resolveForSqlBatch({
          storage: input.storage,
          items: input.items,
          signal: controller.signal,
        }))()
        // Attached here so a rejection that loses the race cannot surface as an unhandled one.
        .catch(error => {
          this.logger.warn(
            `Data Last Updated lookup failed for storage ${input.storage.type}; reporting unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return new Map<string, SourceDataLastUpdated>();
        });

      return await Promise.race([work, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}
