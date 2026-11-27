import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import {
  collectRevealableHiddenFieldNames,
  collectSchemaFieldPaths,
} from '../../data-storage-types/data-mart-schema.utils';
import type { DataMartSchemaField } from '../../data-storage-types/data-mart-schema.type';
import type { ColumnSelector } from '../../dto/schemas/http-data-query.schema';
import type { FilterConfig } from '../../dto/schemas/filter-config.schema';
import type { SortConfig } from '../../dto/schemas/sort-config.schema';
import type {
  AggregationConfig,
  AggregationRule,
} from '../../dto/schemas/aggregation-config.schema';
import {
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';
import type { DateTruncConfig } from '../../dto/schemas/date-trunc-config.schema';
import type { HavingGroupBy } from '../../dto/schemas/having-group-by.schema';
import { calculatedFieldsOf } from '../../calculated-fields/calculated-field.utils';

export interface ReportingColumns {
  /** Every native field name the read may select — the reporting-visible ones plus the hidden
   * ones the request shows (see `hiddenFieldsNamedBy`), INCLUDING a calculated field — the existence
   * authority `HttpDataColumnValidator` binds an explicitly named column against. A calculated
   * metric is a real, selectable field; it must read as "known" the moment it is asked for by
   * name, same as any other column. */
  native: string[];
  /** `native` minus any calculated field — what an implicit-all / wildcard selection (`columns`
   * omitted, `columns=*`, `columns=**`) actually resolves to. Decision 10: a calculated
   * metric is composed only when asked for by name, so adding one to the schema must not change
   * what an existing wildcard caller receives. */
  implicitAllNative: string[];
  /** Every reporting-visible BLENDED field name, INCLUDING a joined Data Mart's calculated field
   * — the existence authority an explicitly named blended column binds against, so naming one
   * earns the refusal that says why it cannot be projected instead of a bare "Unknown column". */
  blended: string[];
  /** `blended` minus any calculated field of a joined Data Mart — the blended half of what a
   * wildcard (`columns=**`) resolves to. Decision 10 again, across the join: such a field cannot
   * be projected at all, so sweeping it in would turn an existing, unchanged wildcard request
   * into a 400 the day someone adds a formula to a Data Mart it merely joins. */
  implicitAllBlended: string[];
  /** Alias paths of the joined sources this endpoint reads — included and accessible, the same
   * predicate `blended` is filtered by. A Unique Count may name only these: any other source is
   * dropped from the SQL downstream, and the read would silently lose its count. */
  reportableSources: string[];
}

export function nativeColumnNames(schema: BlendableSchemaDto): string[] {
  return collectSchemaFieldPaths(schema.nativeFields);
}

export function implicitAllNativeColumnNames(schema: BlendableSchemaDto): string[] {
  const calculatedNames = new Set(calculatedFieldsOf(schema.nativeFields).map(f => f.name));
  return nativeColumnNames(schema).filter(name => !calculatedNames.has(name));
}

// Must stay in sync with the web ReportColumnPicker visibility predicate.
export function reportableSourcePaths(schema: BlendableSchemaDto): string[] {
  return schema.availableSources
    .filter(source => source.isIncluded && source.isAccessibleForReporting)
    .map(source => source.aliasPath);
}

export function visibleBlendedColumnNames(schema: BlendableSchemaDto): string[] {
  const includedPaths = new Set(reportableSourcePaths(schema));
  return schema.blendedFields
    .filter(field => includedPaths.has(field.aliasPath) && !field.isHidden)
    .map(field => field.name);
}

export function implicitAllBlendedColumnNames(schema: BlendableSchemaDto): string[] {
  const calculatedNames = new Set(
    schema.blendedFields.filter(field => field.isCalculated).map(field => field.name)
  );
  return visibleBlendedColumnNames(schema).filter(name => !calculatedNames.has(name));
}

/** The parts of an HTTP Data query that name columns. */
export interface ColumnNamingQuery {
  columnSelector: ColumnSelector;
  filter?: FilterConfig;
  sort?: SortConfig;
  aggregation?: AggregationConfig;
  dateTrunc?: DateTruncConfig;
  havingGroupBy?: HavingGroupBy;
}

/**
 * The main Data Mart's hidden-for-reporting columns this query names, which the read shows.
 *
 * "Hidden for reporting" keeps a column off report pickers, destinations and MCP. A caller that
 * reads the Data Mart over HTTP and names the column — typically a hidden primary key it selects
 * a row by — gets it. A wildcard (`columns` omitted, `*`, `**`) names nothing, so it keeps
 * returning visible columns only. Only top-level stored columns are shown: see
 * `collectRevealableHiddenFieldNames` for what stays hidden and why. Joined Data Marts keep their
 * own hidden columns.
 */
export function hiddenFieldsNamedBy(
  schemaFields: readonly DataMartSchemaField[],
  query: ColumnNamingQuery
): string[] {
  const hidden = new Set(collectRevealableHiddenFieldNames(schemaFields));
  if (hidden.size === 0) return [];
  return [...new Set(namedColumnsOf(query))].filter(name => hidden.has(name));
}

function namedColumnsOf(query: ColumnNamingQuery): string[] {
  const selector = query.columnSelector;
  return [
    ...(selector.mode === 'allBlendable' ? [] : selector.explicit),
    // A pre-join rule names a column of the JOINED Data Mart it slices, not one of this Data Mart
    // (`HttpDataColumnValidator` skips it for the same reason).
    ...(query.filter ?? []).filter(rule => rule.placement !== 'pre-join').map(rule => rule.column),
    ...(query.sort ?? []).map(rule => rule.column),
    ...(query.aggregation ?? []).map(rule => rule.column),
    ...(query.dateTrunc ?? []).map(rule => rule.column),
    ...(query.havingGroupBy?.column ?? []),
    ...(query.havingGroupBy?.dateTrunc ?? []).map(rule => rule.column),
  ];
}

/**
 * The columns of a projection that cannot be read in one request because a shown hidden field is
 * among them: their values would come back mixed up. Empty when the projection is safe.
 *
 * A shown hidden field is a top-level column, read back under its own name. Another selected
 * column gets in its way when that name is also a segment of the other column's path:
 *
 * - the LAST segment — the warehouse names a selected path by it (`customer.id` comes back as
 *   `id`), compares result names case-insensitively and renames a duplicate (`id_1`), so one of
 *   the two is read from the other's column;
 * - an INNER segment — the BigQuery reader finds `device.web_info.browser` by walking the result
 *   row segment by segment, and would step into a column that came back as `web_info`.
 *
 * An aggregated column comes back under its `<column> | <FN>` label, never under its path, so it
 * is compared by that label.
 *
 * The rule holds for every read shape on purpose. A read that runs no SQL (a table read with no
 * filter, sort or limit) would return both columns correctly, but the same request with a filter
 * would not, and a request must not change its answer for that reason.
 *
 * Visible columns clash the same way today, and a read that names no hidden field keeps doing what
 * it did: only a pair that involves a shown hidden field is reported, because that read is new and
 * must not hand out one column's value under another's name.
 */
export function columnsAmbiguousWithShownFields(
  columns: readonly string[],
  shownHiddenFields: ReadonlySet<string>,
  aggregations: readonly AggregationRule[] = []
): string[] {
  const ambiguous = new Set<string>();
  for (const shown of columns) {
    if (!shownHiddenFields.has(shown)) continue;
    const shownNames = resultPathsOf(shown, aggregations).map(path => path.join('.'));
    for (const other of columns) {
      if (other === shown) continue;
      const otherSegments = resultPathsOf(other, aggregations).flat();
      if (shownNames.some(name => otherSegments.includes(name))) {
        ambiguous.add(shown).add(other);
      }
    }
  }
  return columns.filter(column => ambiguous.has(column));
}

/** The path(s) a column is read back by: its own segments, or one label per aggregation. */
function resultPathsOf(column: string, aggregations: readonly AggregationRule[]): string[][] {
  const functions = aggregationFunctionsForColumn([...aggregations], column);
  return functions.length > 0
    ? functions.map(fn => [aggregatedColumnLabel(column, fn).toLowerCase()])
    : [column.toLowerCase().split('.')];
}
