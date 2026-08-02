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
   * The JOINED Data Mart's own declared primary-key columns — EVERY component or none.
   *
   * A value sleeve (joined SUM/AVG/percentile) has to tell one owner row from another before it
   * aggregates. With a declared key it uses that key; without one it falls back to a synthetic
   * per-row surrogate, which cannot tell a genuine duplicate row from two distinct ones.
   *
   * The all-or-nothing rule is load-bearing, not tidiness: this list is consumed by checking that
   * it is non-empty, so a PARTIAL composite key would be indistinguishable from a complete one,
   * and de-duplicating by part of a key merges rows the key itself keeps distinct. Producers must
   * therefore emit `[]` rather than a subset — `collectPrimaryKeyRowIdentity` is the one
   * implementation of that rule. Empty or absent means "no usable key".
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
