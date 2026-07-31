import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorage } from '../../entities/data-storage.entity';
import { SourceDataLastUpdated } from '../../dto/schemas/source-data-last-updated.schema';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlParameter } from '../utils/sql-clause-renderer';

export interface ResolveSourceDataLastUpdatedItem {
  /** Caller-chosen identity (a Data Mart id, or anything) echoed back as the result key. */
  key: string;
  /**
   * The fully-composed SQL whose sources should be measured — output controls and blending
   * already applied. Passing the composed statement rather than the Data Mart definition is what
   * makes a blended result's source set resolvable: every joined Data Mart's tables are already
   * in this SQL.
   */
  sql: string;
  /** Named parameters bound by the SQL; required for warehouses that validate on dry run. */
  params?: SqlParameter[];
}

export interface ResolveSourceDataLastUpdatedBatchInput {
  /** Every item in the batch belongs to this storage, so one client serves them all. */
  storage: DataStorage;
  items: ResolveSourceDataLastUpdatedItem[];
  /** Fires on run cancellation or on the orchestrator's soft deadline. */
  signal?: AbortSignal;
}

/**
 * Resolves when the source tables behind a query last changed at the warehouse.
 *
 * The contract is a BATCH keyed by storage — a single lookup is simply a batch of one. That
 * shape exists because the expensive part is per-storage, not per-query: resolving credentials
 * and standing up a warehouse client. A canvas-wide sweep over one storage should pay that once,
 * not once per Data Mart.
 *
 * Implementations are BEST EFFORT by contract: they answer with `coverage: 'unavailable'` and a
 * null timestamp rather than throwing whenever the warehouse cannot tell us, because a declared
 * "unknown" is more useful to a business user than a failed run. They must never mutate state,
 * must never be on the critical path of returning rows, and must stop early once `signal`
 * aborts — returning whatever they resolved so far rather than finishing discarded work.
 *
 * A storage with no implementation registered simply resolves to nothing — see
 * `SourceDataLastUpdatedService`, which degrades a missing resolver to `unavailable`.
 */
export interface SourceDataLastUpdatedResolver extends TypedComponent<DataStorageType> {
  /**
   * Returns one entry per item it managed to resolve, keyed by {@link
   * ResolveSourceDataLastUpdatedItem.key}. Keys may be absent from the map when the lookup was
   * cut short; callers treat a missing key as "no new information", not as a reset.
   */
  resolveForSqlBatch(
    input: ResolveSourceDataLastUpdatedBatchInput
  ): Promise<Map<string, SourceDataLastUpdated>>;
}
