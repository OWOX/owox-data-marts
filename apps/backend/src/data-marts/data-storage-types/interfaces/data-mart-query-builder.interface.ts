import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { GroupRestriction, RoutedGroupRestriction } from '../../dto/domain/group-restriction';
import { RoutedFilterRule } from '../../dto/domain/filter-clause';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { DateTruncRule } from '../../dto/schemas/date-trunc-config.schema';
import { CalculatedFieldPlan, SqlParameter } from '../utils/sql-clause-renderer';

export interface DataMartQueryOptions {
  /**
   * Optional list of column expressions to project via SELECT.
   * When set, `SELECT *` is replaced with `SELECT <escaped-columns>`.
   * Each builder escapes per its dialect. SQL-definition data marts are
   * wrapped as `SELECT <cols> FROM (<user-sql>)` to avoid mutating user SQL.
   */
  columns?: string[];

  /**
   * Output filters — WHERE on the final SELECT, or HAVING once the query is aggregated. Which one
   * is the clause each rule CARRIES, read through `filterClauseOf`; a builder never
   * re-derives it from `rule.function`.
   *
   * Typed as the plain rule because the dialect builders and their specs are also driven with
   * hand-built rules, for which `filterClauseOf`'s fallback is the answer. The
   * requirement to ROUTE is enforced one level up, on {@link RoutedDataMartQueryOptions}, which is
   * what `DataMartQueryBuilderFacade` takes — and the facade is the only way production code
   * reaches a builder.
   */
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

  /** Output sort — applied as ORDER BY on the final SELECT. */
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
   * Totals only: restrict the query to the rows of the groups the report's metric (HAVING)
   * filters keep. A Totals query has no GROUP BY, so those filters cannot apply directly —
   * see `SqlClauseRenderer.renderKeptGroupsJoin`.
   */
  groupRestriction?: GroupRestriction;

  /**
   * Column name → storage field type. Positional dialects (Athena) use it to cast
   * date/time filter placeholders so a varchar literal is not compared against a
   * DATE/TIMESTAMP column. Optional; dialects that bind typed params ignore it.
   */
  columnTypes?: ReadonlyMap<string, string>;

  /**
   * Calculated fields selected in `columns` (main-owner only). A calculated field
   * IS an aggregate, so its presence forces the aggregated path even with an otherwise-empty
   * `aggregations`/`dateTruncs` — the remaining projected columns become its grouping keys.
   */
  calculatedFields?: CalculatedFieldPlan[];

  /**
   * Calculated fields a FILTER (or a Totals restriction's HAVING) names, whether or not the report
   * SELECTS them. A predicate on one compares the field's FORMULA — its name is a
   * SELECT alias with no warehouse column behind it — so the plan has to reach the renderer even
   * when the field is not projected. Kept separate from `calculatedFields` precisely because that
   * list is the PROJECTION: a filter-only field added to it would appear in the SELECT, in the
   * headers, and in the Google Sheet, under a name nobody asked for.
   */
  calculatedFilterMetrics?: CalculatedFieldPlan[];
}

/**
 * What `DataMartQueryBuilderFacade` takes — the same options with every filter's clause already
 * DECIDED.
 *
 * This is the guard, and it is placed here rather than on `DataMartQueryOptions` deliberately. The
 * hole it closes is a NEW PRODUCER forwarding `report.filterConfig` straight through: that is a
 * `FilterRule[]`, it satisfies an optional stamp perfectly, and its blast radius is an
 * aggregate-level Calculated Field's predicate landing in `WHERE`. Every producer reaches a builder
 * through this facade — nothing outside `data-storage-types/` so much as names
 * `DataMartQueryOptions` — so the compiler now refuses an unrouted list at exactly the boundary the
 * mistake crosses, while the builders and their five dialect specs keep taking plain rules.
 */
export type RoutedDataMartQueryOptions = Omit<
  DataMartQueryOptions,
  'filters' | 'groupRestriction'
> & {
  filters?: RoutedFilterRule[];
  groupRestriction?: RoutedGroupRestriction;
};

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
