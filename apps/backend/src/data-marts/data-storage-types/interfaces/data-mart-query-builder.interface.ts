import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { DateTruncRule } from '../../dto/schemas/date-trunc-config.schema';
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

  /**
   * Aggregations applied to projected `columns`. Group-by is implied: any column
   * in `columns` without a rule becomes a grouping key. Rendered as
   * `SELECT <dims>, FN(<metric>) AS <metric> ... GROUP BY <dims>`.
   */
  aggregations?: AggregationRule[];

  /**
   * Date-trunc rules attaching a calendar bucket (DAY/WEEK/MONTH/QUARTER/YEAR) to a
   * dimension column. The truncated expression becomes both the projected column
   * (aliased to the column name) and its GROUP BY key. Triggers the aggregated path
   * even with zero metric aggregations.
   */
  dateTruncs?: DateTruncRule[];

  /**
   * When true, append a synthetic `COUNT(*) AS "Row Count"` metric to the aggregated
   * SELECT (no extra GROUP BY key). Triggers the aggregated path even with zero metric
   * aggregations and zero date-trunc rules.
   */
  rowCount?: boolean;

  /**
   * When true, append a synthetic `COUNT(DISTINCT <pk-tuple>) AS "Unique Count"` metric
   * to the aggregated SELECT (no extra GROUP BY key). Requires `primaryKeyColumns` to be
   * non-empty. Triggers the aggregated path even with zero metric aggregations.
   */
  uniqueCount?: boolean;

  /**
   * Primary-key column names used to build the COUNT(DISTINCT …) expression for the
   * Unique Count metric. Required when `uniqueCount` is true; ignored otherwise.
   */
  primaryKeyColumns?: string[];

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
