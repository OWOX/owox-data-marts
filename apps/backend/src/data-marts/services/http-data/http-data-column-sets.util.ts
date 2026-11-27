import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import {
  collectRevealableHiddenPaths,
  collectSchemaFieldPaths,
} from '../../data-storage-types/data-mart-schema.utils';
import type { DataMartSchemaField } from '../../data-storage-types/data-mart-schema.type';
import type { ColumnSelector } from '../../dto/schemas/http-data-query.schema';
import type { FilterConfig } from '../../dto/schemas/filter-config.schema';
import type { SortConfig } from '../../dto/schemas/sort-config.schema';
import type { AggregationConfig } from '../../dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../../dto/schemas/date-trunc-config.schema';
import type { HavingGroupBy } from '../../dto/schemas/having-group-by.schema';
import { calculatedFieldsOf } from '../../calculated-fields/calculated-field.utils';

export interface ReportingColumns {
  /** Every reporting-visible native field name, INCLUDING a calculated field — the existence
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
 * The main Data Mart's hidden-for-reporting paths this query names, which the read shows.
 *
 * "Hidden for reporting" keeps a column off report pickers, destinations and MCP. A caller that
 * reads the Data Mart over HTTP and names the column — typically a hidden primary key it selects
 * a row by — gets it. A wildcard (`columns` omitted, `*`, `**`) names nothing, so it keeps
 * returning visible columns only. Hidden calculated fields stay hidden (see
 * `collectRevealableHiddenPaths`), and joined Data Marts keep their own hidden columns.
 */
export function hiddenFieldsNamedBy(
  schemaFields: readonly DataMartSchemaField[],
  query: ColumnNamingQuery
): string[] {
  const hidden = new Set(collectRevealableHiddenPaths(schemaFields));
  if (hidden.size === 0) return [];
  return [...new Set(namedColumnsOf(query))].filter(name => hidden.has(name));
}

function namedColumnsOf(query: ColumnNamingQuery): string[] {
  const selector = query.columnSelector;
  return [
    ...(selector.mode === 'allBlendable' ? [] : selector.explicit),
    ...(query.filter ?? []).map(rule => rule.column),
    ...(query.sort ?? []).map(rule => rule.column),
    ...(query.aggregation ?? []).map(rule => rule.column),
    ...(query.dateTrunc ?? []).map(rule => rule.column),
    ...(query.havingGroupBy?.column ?? []),
    ...(query.havingGroupBy?.dateTrunc ?? []).map(rule => rule.column),
  ];
}
