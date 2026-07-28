import { Inject, Injectable, Logger } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { SOURCE_DATA_LAST_UPDATED_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { SourceDataLastUpdatedResolver } from '../data-storage-types/interfaces/source-data-last-updated-resolver.interface';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { DataStorage } from '../entities/data-storage.entity';
import { SourceDataLastUpdated } from '../dto/schemas/source-data-last-updated.schema';

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
    private readonly resolverRegistry: TypeResolver<DataStorageType, SourceDataLastUpdatedResolver>
  ) {}

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
    const softTimeoutMs =
      input.softTimeoutMs ?? SourceDataLastUpdatedService.DEFAULT_SOFT_TIMEOUT_MS;

    const resolver = await this.resolverRegistry
      .tryResolve(input.storage.type)
      .catch(() => undefined);
    if (!resolver) {
      // Expected for storages whose implementation has not landed yet — debug, not warn.
      this.logger.debug(
        `No Data Last Updated resolver for storage ${input.storage.type}; reporting unavailable.`
      );
      return this.unavailable();
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
      const timedOut = Symbol('timedOut');
      const deadline = new Promise<typeof timedOut>(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(timedOut);
        }, softTimeoutMs);
      });

      const work = resolver
        .resolveForSql({
          storage: input.storage,
          sql: input.sql,
          params: input.params,
          signal: controller.signal,
        })
        // Attached here so a rejection that loses the race cannot surface as an unhandled one.
        .catch(error => {
          this.logger.warn(
            `Data Last Updated lookup failed for storage ${input.storage.type}; reporting unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return this.unavailable();
        });

      const result = await Promise.race([work, deadline]);
      if (result === timedOut) {
        this.logger.warn(
          `Data Last Updated lookup exceeded ${softTimeoutMs}ms for storage ${input.storage.type}; reporting unavailable.`
        );
        return this.unavailable();
      }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private unavailable(): SourceDataLastUpdated {
    return {
      dataLastUpdatedAt: null,
      computedAt: new Date().toISOString(),
      coverage: 'unavailable',
      sources: [],
    };
  }
}
