import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { DateTruncRule } from '../../dto/schemas/date-trunc-config.schema';
import { QueryBuildResult } from './data-mart-query-builder.interface';
import { GroupRestriction } from '../../dto/domain/group-restriction';

export interface BlendedFieldConfig {
  targetFieldName: string;
  outputAlias: string;
  isHidden: boolean;
  aggregateFunction: AggregateFunction;
  /** Gates the deterministic roll-up substitution — see `preJoinAggregateFunctionFor`. */
  targetFieldType?: string;
}

export interface ResolvedRelationshipChain {
  relationship: DataMartRelationship;
  targetTableReference: string;
  parentAlias: string;
  cteName: string;
  blendedFields: BlendedFieldConfig[];
  targetDataMartTitle: string;
  targetDataMartUrl: string;
  /**
   * The joined Data Mart's declared primary key — EVERY component or none. Consumers only check
   * that it is non-empty, so a partial composite key would look complete and de-duplicate rows
   * the key itself keeps distinct. Producers emit `[]` instead; see
   * `collectPrimaryKeyRowIdentity`.
   */
  targetPrimaryKeyFields?: string[];
}

/**
 * Storage field types for post-join filter columns (home native fields + blended
 * output aliases), so positional dialects (Athena) can cast date/time placeholders.
 * Pre-join slice types are resolved via the field index instead.
 */
export interface BlendedColumnTypes {
  postJoin?: ReadonlyMap<string, string>;
}

/**
 * Flat resolution entry for one blended field, keyed by its unified name from
 * `buildBlendedFieldUnifiedName` (identity = aliasPath + originalFieldName):
 * - flat:   `<aliasPath dots→_>`__`<originalFieldName>`
 * - nested: `<aliasPath dots→_>`__`<originalFieldName dots→_>`__`<sha1(aliasPath|originalFieldName)[0:8]>`
 * Single source of truth for resolving a unified column identifier back to the data it encodes.
 */
export interface BlendedFieldEntry {
  aliasPath: string; // 'category.details'
  cteName: string; // 'category_details'
  originalFieldName: string; // 'item.event_count' (nested-struct dots preserved)
  type: string;
  // The RAW source-field type, before the dedup effective-type resolution overwrites `type`.
  // Pre-join slices run on the raw column BEFORE dedup, so they type-check/cast by this.
  sourceFieldType: string;
  isIncluded: boolean; // false when the source is excluded from reporting
}

/**
 * What the SQL builder needs to emit one joined source's counting sleeve. It has no business
 * reading a display string, so it cannot see one.
 */
export interface JoinedUniqueCountSleeve {
  aliasPath: string;
  /** The chain CTE that owns it — its `_raw` variant is what the sleeve counts over. */
  cteName: string;
  /** All key components or none, from `collectPrimaryKeyRowIdentity`. Never empty here. */
  pkColumns: string[];
  /**
   * The SQL output column — `orders__unique_count`, from `buildJoinedUniqueCountColumnName`. It is
   * both the sleeve's `AS` alias and the `ReportDataHeader.name`, so it must be a legal identifier:
   * the source's free-form display prefix belongs in `displayLabel`, never here.
   */
  outputLabel: string;
}

/**
 * What the header resolver needs to name that same column: the two labels, and nothing about how
 * the SQL was built.
 */
export interface JoinedUniqueCountHeaderSource {
  /** Joins the header to the SQL column — see `JoinedUniqueCountSleeve.outputLabel`. */
  outputLabel: string;
  /** `<prefix> Unique Count` — the human string, carried as the header's display alias. */
  displayLabel: string;
}

/**
 * One joined source whose distinct primary keys the report counts, as the resolver produces it:
 * everything both consumers need. Each consumer takes only its own half above.
 */
export interface JoinedUniqueCountSource
  extends JoinedUniqueCountSleeve, JoinedUniqueCountHeaderSource {}

export interface BlendedQueryContext {
  mainTableReference: string;
  mainDataMartTitle: string;
  mainDataMartUrl: string;
  chains: ResolvedRelationshipChain[];
  columns: string[];
  filters?: FilterRule[];
  sort?: SortRule[];
  limit?: number | null;
  // Post-join aggregation over the flat blended result (an outer GROUP BY on the
  // final SELECT). Mirrors DataMartQueryOptions; the pre-join rollup is unrelated.
  aggregations?: AggregationRule[];
  dateTruncs?: DateTruncRule[];
  rowCount?: boolean;
  uniqueCount?: boolean;
  primaryKeyColumns?: string[];
  /**
   * Joined sources with a per-source `COUNT(DISTINCT <key>)`. Separate from `uniqueCount` /
   * `primaryKeyColumns`, which stay the MAIN Data Mart's metric so legacy reports emit
   * byte-identical SQL.
   */
  uniqueCountSources?: JoinedUniqueCountSleeve[];
  columnTypes?: BlendedColumnTypes;
  fieldIndex?: ReadonlyMap<string, BlendedFieldEntry>;
  /**
   * Restricts this query to the rows of the GROUPS that survive the report's metric (HAVING)
   * filters. Set only for the Totals query: Totals have no GROUP BY, so a per-group constraint
   * has nothing to filter there — without this they summarise rows the report itself hides.
   *
   * The builder recomputes the surviving groups as one more CTE over the SAME sources and
   * semi-joins it (a GROUP BY result has distinct tuples, so the join adds no fan-out). Every
   * metric is then computed over the surviving ROWS, which is what keeps a symmetric aggregate
   * right: a COUNT DISTINCT entity present in two surviving groups still counts once.
   */
  groupRestriction?: GroupRestriction;
}

export interface BlendedQueryBuilder {
  readonly type: DataStorageType;
  buildBlendedQuery(context: BlendedQueryContext): string | QueryBuildResult;
}
