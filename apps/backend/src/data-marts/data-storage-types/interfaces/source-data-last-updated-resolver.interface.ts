import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorage } from '../../entities/data-storage.entity';
import { SourceDataLastUpdated } from '../../dto/schemas/source-data-last-updated.schema';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlParameter } from '../utils/sql-clause-renderer';

export interface ResolveSourceDataLastUpdatedInput {
  storage: DataStorage;
  /**
   * The fully-composed SQL that is about to be (or is being) executed for the run — output
   * controls and blending already applied. Passing the composed statement rather than the Data
   * Mart definition is what makes a blended result's source set resolvable: every joined Data
   * Mart's tables are already in this SQL.
   */
  sql: string;
  /** Named parameters bound by the composed SQL; required for warehouses that validate on dry run. */
  params?: SqlParameter[];
  /** Fires on run cancellation or on the orchestrator's soft deadline. */
  signal?: AbortSignal;
}

/**
 * Resolves when the source tables behind a query last changed at the warehouse.
 *
 * Implementations are BEST EFFORT by contract: they answer with `coverage: 'unavailable'` and a
 * null timestamp rather than throwing whenever the warehouse cannot tell us, because a declared
 * "unknown" is more useful to a business user than a failed run. They must never mutate state,
 * must never be on the critical path of returning rows, and must honour `signal` where the
 * underlying client allows it.
 *
 * A storage with no implementation registered simply resolves to nothing — see
 * `SourceDataLastUpdatedService`, which degrades a missing resolver to `unavailable`.
 */
export interface SourceDataLastUpdatedResolver extends TypedComponent<DataStorageType> {
  resolveForSql(input: ResolveSourceDataLastUpdatedInput): Promise<SourceDataLastUpdated>;
}
