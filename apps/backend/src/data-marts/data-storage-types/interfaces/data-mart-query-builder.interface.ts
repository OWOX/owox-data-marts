import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { SqlParameter } from '../utils/sql-clause-renderer';

export interface DataMartQueryOptions {
  /**
   * Optional list of column expressions to project via SELECT.
   * When set, `SELECT *` is replaced with `SELECT <escaped-columns>`.
   * Each builder escapes per its dialect. SQL-definition data marts are
   * wrapped as `SELECT <cols> FROM (<user-sql>)` to avoid mutating user SQL.
   */
  columns?: string[];

  /** Output filters (Task 7+) — applied as WHERE on the final SELECT. */
  filters?: FilterRule[];

  /** Output sort (Task 7+) — applied as ORDER BY on the final SELECT. */
  sort?: SortRule[];

  /** Output row limit (no offset). */
  limit?: number | null;

  /**
   * Pre-resolved fully-qualified table reference. When set, SQL-definition data
   * marts use this as the FROM target (typically the internal view created by
   * DataMartTableReferenceService) instead of wrapping the user SQL.
   */
  mainTableReference?: string;

  /**
   * Column name → storage field type. Positional dialects (Athena) use it to cast
   * date/time filter placeholders so a varchar literal is not compared against a
   * DATE/TIMESTAMP column. Optional; dialects that bind typed params ignore it.
   */
  columnTypes?: ReadonlyMap<string, string>;
}

export interface QueryBuildResult {
  sql: string;
  params?: SqlParameter[];
}

export function isQueryBuildResult(v: string | QueryBuildResult): v is QueryBuildResult {
  return typeof v === 'object' && v !== null && 'sql' in v;
}

export interface DataMartQueryBuilder {
  readonly type: DataStorageType;
  buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): string | QueryBuildResult;
}

export interface DataMartQueryBuilderAsync {
  readonly type: DataStorageType;
  buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): Promise<string | QueryBuildResult>;
}
