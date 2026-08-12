import { Injectable, BadRequestException } from '@nestjs/common';
import { FilterConfig, FilterConfigSchema, FilterRule } from '../dto/schemas/filter-config.schema';
import { SortConfig, SortConfigSchema, SortRule } from '../dto/schemas/sort-config.schema';
import {
  AggregationConfig,
  AggregationConfigSchema,
  AggregationRule,
} from '../dto/schemas/aggregation-config.schema';
import {
  DateTruncConfig,
  DateTruncConfigSchema,
  DateTruncRule,
  IANA_TIME_ZONE_PATTERN,
} from '../dto/schemas/date-trunc-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { BlendableSchemaAccessor, BlendableSchemaService } from './blendable-schema.service';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { throwDisconnectedReportColumnsError } from '../errors/disconnected-report-columns.error';
import {
  JoinedUniqueCountAvailability,
  collectSchemaFieldPathTypes,
  collectSchemaFieldPathDescriptors,
} from '../data-storage-types/data-mart-schema.utils';
import { buildBlendedFieldIndex } from './blended-field-index';
import { buildJoinedUniqueCountColumnName } from './blended-field-name';
import { BlendedFieldEntry } from '../data-storage-types/interfaces/blended-query-builder.interface';
import {
  NUMBER_TYPES,
  DATE_TYPES,
  categorizeFieldType,
  INTERNAL_OPERATORS_BY_CATEGORY,
  TYPE_AGNOSTIC_OPS,
} from '../dto/schemas/field-type-category';
import {
  resolveFieldGovernance,
  AggregationRole,
} from '../dto/schemas/field-aggregation-governance';
import {
  ReportAggregateFunction,
  SLEEVE_ROUTED_FUNCTIONS,
} from '../dto/schemas/aggregate-function.schema';
import { computeEffectiveType } from '../data-storage-types/field-aggregation';
import { StorageFieldType } from '../dto/domain/storage-field-type';
import { truncateIdentifierToByteLimit } from '../data-storage-types/utils/identifier-limits.utils';
import {
  ROW_COUNT_LABEL,
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../dto/schemas/aggregation-labels';
import { isMetricsOnlyProjection } from '../dto/domain/report-like-read-plan';
import { UniqueCountConfig } from '../dto/schemas/unique-count-config.schema';
import {
  hasMainUniqueCount,
  JOINED_UNIQUE_COUNT_NAME_SUFFIX,
  joinedUniqueCountSources,
  normalizeUniqueCountSources,
} from '../dto/schemas/unique-count-sources';

// DATE_TYPES that carry a time-of-day component (TIMESTAMP, DATETIME, etc.).
// A timeZone conversion is only meaningful for these — applying it to a pure
// DATE column emits invalid SQL in BigQuery, Athena, and Databricks.
const TIMESTAMP_TYPES = new Set([...DATE_TYPES].filter(t => t !== 'DATE'));

export type ValidationError =
  | { code: 'FILTER_COLUMN_UNKNOWN'; column: string; aliasPath?: string }
  | {
      code: 'INVALID_OPERATOR_FOR_TYPE';
      column: string;
      type: string;
      operator: string;
      aliasPath?: string;
    }
  | { code: 'INVALID_REGEX_PATTERN'; column: string; pattern: string; aliasPath?: string }
  | { code: 'SORT_COLUMN_NOT_SELECTED'; column: string }
  | { code: 'FILTER_ALIAS_PATH_UNKNOWN'; aliasPath: string; column: string } // retained for backward compatibility; no longer emitted by validateFilters
  | { code: 'FILTER_ALIAS_PATH_NOT_INCLUDED'; aliasPath: string; column: string }
  | { code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' }
  | { code: 'AGGREGATION_COLUMN_NOT_SELECTED'; column: string }
  | {
      code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE';
      column: string;
      function: string;
      type: string;
    }
  | {
      code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD';
      column: string;
      function: string;
    }
  | { code: 'DUPLICATE_AGGREGATION'; column: string; function: string }
  | { code: 'DATE_TRUNC_COLUMN_NOT_SELECTED'; column: string }
  | { code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN'; column: string; type: string }
  | { code: 'DATE_TRUNC_COLUMN_IS_AGGREGATED'; column: string }
  | { code: 'DATE_TRUNC_INVALID_TIMEZONE'; column: string; timeZone: string }
  | { code: 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP'; column: string; type: string }
  | { code: 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY'; message: string }
  // A HAVING filter (rule carries `function`) must target a configured aggregation —
  // i.e. the (column, function) pair must exist in aggregationConfig.
  | { code: 'HAVING_FILTER_NOT_AGGREGATED'; column: string; function: string }
  // A HAVING filter (rule carries `function`) is inherently post-aggregation and cannot be
  // pushed pre-join: the blended builder routes a pre-join rule to a CTE where
  // function-carrying rules are dropped, so the constraint would apply NOWHERE.
  | { code: 'HAVING_FILTER_INVALID_PLACEMENT'; column: string; function: string }
  // a joined (blended) COUNT_DISTINCT/SUM/AVG (SLEEVE_ROUTED_FUNCTIONS) is rendered in
  // SELECT via a "sleeve" CTE (the report-dimension-grain computation that avoids join-fanout
  // over/under-counting), but renderHaving still derives its aggregate expression from the
  // dedup CTE — the OLD, wrong value. Until HAVING is sleeve-routed, block the combination
  // outright. A MAIN (native) column, or a joined MIN/MAX/COUNT (not sleeve-routed), has no
  // sleeve involved and is unaffected.
  | {
      code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED';
      column: string;
      function: string;
      message: string;
    }
  // An aggregated / date-trunc report needs an explicit column projection: the SELECT
  // builder only emits a metric/date-trunc column when it is listed in columnConfig, so a
  // null/empty columnConfig would silently drop every metric (and produce a header set that
  // no longer matches the SELECT). Require the projection up front.
  | { code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' }
  // A joined Data Mart's Unique Count is rendered by the blended builder, which rejects a
  // null ("all native columns") projection outright — so saving that combination produces a
  // report that fails every run, scheduled run and Generated SQL preview.
  | { code: 'JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG'; message: string }
  // A joined Data Mart's Unique Count is configured for a source that can never produce the
  // column — the alias path is gone from the schema, or the source has no primary key the metric
  // can count. The run path drops such a source from the SQL and the headers alike, so accepting
  // it at save persists a column that silently never appears. Raised on the SAVE paths only (see
  // `rejectUnavailableUniqueCountSources`); a source merely EXCLUDED from reporting is not
  // rejected — the picker keeps its entry so the user can clear it.
  | { code: 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE'; aliasPath: string; message: string }
  // A filter (or pre-join slice) names a Unique Count output column. The metric is computed over
  // the whole projection, so there is no row-level column to bind a predicate to — it can only be
  // selected and sorted by. Without this code the rule falls through as an unknown filter column
  // and the caller is told to repair a schema link that is not broken.
  | { code: 'UNIQUE_COUNT_FILTER_UNSUPPORTED'; column: string; message: string }
  // An aggregation or date-trunc rule names a Unique Count output column. The metric IS an
  // aggregate, so there is nothing to aggregate or bucket again. Without these codes the rule
  // falls through to the `type === undefined` branches and comes back as
  // AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE / DATE_TRUNC_REQUIRES_DATE_COLUMN with
  // `type: 'unknown'` — pointing the caller at a schema problem that does not exist.
  | { code: 'UNIQUE_COUNT_AGGREGATION_UNSUPPORTED'; column: string; message: string }
  | { code: 'UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED'; column: string; message: string }
  // A Unique Count output column is listed in the report's PROJECTION. The metric is emitted by
  // the blended builder from `uniqueCountConfig`, never selected as a column, so the name resolves
  // to nothing at run time and the report fails every run with the disconnected-columns error —
  // after an MCP-created Google Sheet already exists.
  | { code: 'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE'; column: string; message: string }
  // Two projected output columns resolve to the SAME output name — a dimension whose name
  // equals a synthetic label (Row Count / Unique Count / "<col> | TOKEN"), or any
  // two projected columns colliding, INCLUDING a pair that differs only in letter case.
  // Duplicate alias error on BigQuery / silent clobber on name-keyed readers. `label` is the
  // colliding output name.
  | { code: 'OUTPUT_COLUMN_NAME_COLLISION'; label: string };

// Why a joined source cannot supply the metric. EXHAUSTIVE over every non-`available` verdict, not
// `Partial`: an unmapped value would fall through the `if (!reason)` skip below and silently let the
// save through, so a verdict added later must break this build rather than the report.
const UNUSABLE_UNIQUE_COUNT_KEY_REASONS: Record<
  Exclude<JoinedUniqueCountAvailability, 'available'>,
  string
> = {
  'no-primary-key': 'it has no primary key',
  'disconnected-primary-key': 'its primary key field is disconnected from the schema',
  'nested-primary-key': 'its primary key is a nested field',
  'nested-and-disconnected-primary-key':
    'its primary key is a nested field and part of it is disconnected from the schema',
};

// `available` is the one verdict with nothing to explain.
function unusableUniqueCountKeyReason(
  availability: JoinedUniqueCountAvailability
): string | undefined {
  return availability === 'available' ? undefined : UNUSABLE_UNIQUE_COUNT_KEY_REASONS[availability];
}

function operatorAllowed(fieldType: string, operator: string): boolean {
  if (TYPE_AGNOSTIC_OPS.has(operator)) return true;
  return INTERNAL_OPERATORS_BY_CATEGORY[categorizeFieldType(fieldType)].has(operator);
}

@Injectable()
export class OutputControlsValidatorService {
  constructor(
    private readonly capabilityService: OutputControlsCapabilityService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  validateFilters(
    filters: FilterRule[],
    homeFieldTypes: Map<string, string>,
    fieldIndex: ReadonlyMap<string, BlendedFieldEntry> = new Map()
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const rule of filters) {
      // Rules carrying a `function` are HAVING (post-aggregation) — validated by
      // validateHavingFilters against the aggregate's effective type, not here.
      if (rule.function) continue;
      if (rule.placement === 'pre-join') {
        const f = fieldIndex.get(rule.column);
        if (!f) {
          errors.push({ code: 'FILTER_COLUMN_UNKNOWN', column: rule.column });
          continue;
        }
        if (!f.isIncluded) {
          errors.push({
            code: 'FILTER_ALIAS_PATH_NOT_INCLUDED',
            aliasPath: f.aliasPath,
            column: rule.column,
          });
          continue;
        }
        // Pre-join slices run on the raw column in the `*_raw` CTE BEFORE dedup, so they
        // type-check by the RAW source type, not the dedup effective `type` (e.g. a STRING
        // deduped COUNT_DISTINCT is effective INTEGER but a `contains` slice is valid). The
        // post-join branch below correctly keeps the effective type.
        this.validateRuleAgainstType(rule, f.sourceFieldType ?? f.type, f.aliasPath, errors);
      } else {
        const type = homeFieldTypes.get(rule.column);
        if (type === undefined) {
          errors.push({ code: 'FILTER_COLUMN_UNKNOWN', column: rule.column });
          continue;
        }
        this.validateRuleAgainstType(rule, type, undefined, errors);
      }
    }
    return errors;
  }

  /**
   * Validates HAVING (post-aggregation) filters — rules carrying a `function`. Each must
   * reference a configured aggregation (the (column, function) pair must exist in
   * aggregationConfig), and its operator is checked against the aggregate's EFFECTIVE
   * result type (COUNT→integer, AVG/percentile→float, STRING_AGG→string), not the
   * column's raw type — so `COUNT(name) > 5` is valid even though `name` is a string.
   *
   * `blendedFieldIndex` (the same index `validateFilters` uses to resolve pre-join slices)
   * doubles as the "is this column blended?" lookup: a HAVING whose function is
   * SLEEVE_ROUTED_FUNCTIONS (COUNT_DISTINCT, SUM, or AVG) AND whose column resolves in that
   * index targets a joined field, which is rejected -- see sleeve gate.
   *
   * `blendedFieldIndex` is REQUIRED (no `= new Map` default, Mediums): a
   * default silently disables the sleeve gate above for any caller that forgets to pass it,
   * letting a HAVING on a joined COUNT_DISTINCT/SUM/AVG through to filter on the wrong
   * (dedup-CTE) value with no error at all. Every real caller already has the index
   * (`validateForReport` builds it via `buildBlendedFieldIndex`) — pass an empty `Map()`
   * explicitly for the "no blended fields" case instead of relying on a default.
   */
  validateHavingFilters(
    filters: FilterRule[],
    aggregations: AggregationRule[],
    resolveType: (column: string) => string | undefined,
    storageType: DataStorageType,
    blendedFieldIndex: ReadonlyMap<string, BlendedFieldEntry>
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const aggregatedPairs = new Set(aggregations.map(a => `${a.column}\u241F${a.function}`));
    for (const rule of filters) {
      if (!rule.function) continue;
      // A HAVING is post-aggregation; it cannot be pushed pre-join. On the blended path a
      // pre-join rule is routed to a CTE where function-carrying rules are dropped, so the
      // constraint would apply nowhere (silent wrong rows). Reject the combo outright.
      if (rule.placement === 'pre-join') {
        errors.push({
          code: 'HAVING_FILTER_INVALID_PLACEMENT',
          column: rule.column,
          function: rule.function,
        });
        continue;
      }
      if (!aggregatedPairs.has(`${rule.column}\u241F${rule.function}`)) {
        errors.push({
          code: 'HAVING_FILTER_NOT_AGGREGATED',
          column: rule.column,
          function: rule.function,
        });
        continue;
      }
      // a joined (blended) COUNT_DISTINCT/SUM/AVG is rendered in SELECT via a "sleeve"
      // CTE computed at the report's dimension grain, to avoid the over/under-counting a plain
      // dedup-then-re-aggregate produces across a join fan-out (see collectSleeveMetrics /
      // SLEEVE_ROUTED_FUNCTIONS (blending/metric-sleeve.planner.ts), which this gate MUST stay
      // in lockstep with). HAVING is NOT (yet) routed through that sleeve -- it re-derives its
      // aggregate expression from the dedup CTE, i.e. the OLD, wrong value (see
      // the builder throws for it too). Reject outright rather than
      // silently filtering on a value that doesn't match what SELECT displays. A MAIN (native)
      // column, or a joined MIN/MAX/COUNT (not sleeve-routed), is unaffected -- only fires when
      // both the function is sleeve-routed AND the column resolves as blended.
      if (SLEEVE_ROUTED_FUNCTIONS.has(rule.function) && blendedFieldIndex.has(rule.column)) {
        errors.push({
          code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
          column: rule.column,
          function: rule.function,
          message:
            `HAVING filter on a joined (blended) ${rule.function} column ("${rule.column}") ` +
            'is not yet supported: the post-join filter cannot be routed through the same ' +
            'dedup-safe computation used for the SELECT value, so it would filter on a ' +
            'different, incorrect value. Remove this HAVING condition, or filter on a MAIN ' +
            '(non-blended) column instead.',
        });
        continue;
      }
      const rawType = resolveType(rule.column);
      if (rawType === undefined) {
        errors.push({ code: 'FILTER_COLUMN_UNKNOWN', column: rule.column });
        continue;
      }
      const effectiveType = computeEffectiveType(
        rawType as StorageFieldType,
        rule.function,
        storageType
      );
      this.validateRuleAgainstType(rule, effectiveType, undefined, errors);
    }
    return errors;
  }

  private validateRuleAgainstType(
    rule: FilterRule,
    type: string,
    aliasPath: string | undefined,
    errors: ValidationError[]
  ): void {
    if (!operatorAllowed(type, rule.operator)) {
      errors.push({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: rule.column,
        type,
        operator: rule.operator,
        ...(aliasPath ? { aliasPath } : {}),
      });
      return;
    }
    if (rule.operator === 'regex' || rule.operator === 'not_regex') {
      const pattern = String(rule.value);
      try {
        new RegExp(pattern);
      } catch {
        errors.push({
          code: 'INVALID_REGEX_PATTERN',
          column: rule.column,
          pattern,
          ...(aliasPath ? { aliasPath } : {}),
        });
      }
    }
  }

  validateSort(sort: SortRule[], selectedColumns: ReadonlySet<string>): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const rule of sort) {
      if (!selectedColumns.has(rule.column)) {
        errors.push({ code: 'SORT_COLUMN_NOT_SELECTED', column: rule.column });
      }
    }
    return errors;
  }

  validateAggregations(
    aggregations: AggregationRule[],
    selectedColumns: ReadonlySet<string>,
    resolveType: (column: string) => string | undefined,
    resolveAllowed?: (column: string) => readonly string[] | undefined
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    // A repeated (column, function) pair would alias two SELECT items to the same
    // output column — reject it so the duplicate output column can't silently clobber.
    const seenPairs = new Set<string>();
    for (const rule of aggregations) {
      if (!selectedColumns.has(rule.column)) {
        errors.push({ code: 'AGGREGATION_COLUMN_NOT_SELECTED', column: rule.column });
        continue;
      }
      const pairKey = `${rule.column}\u0000${rule.function}`;
      if (seenPairs.has(pairKey)) {
        errors.push({
          code: 'DUPLICATE_AGGREGATION',
          column: rule.column,
          function: rule.function,
        });
        continue;
      }
      seenPairs.add(pairKey);
      // An unresolvable type disables BOTH gates below, and the governance map skips the same
      // columns the type map does (a hidden blended field is absent from both), so anything at
      // all would pass — percentiles included, which have no type floor. `validateDateTruncs`
      // rejects this case; be symmetric.
      if (resolveType(rule.column) === undefined) {
        errors.push({
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
          column: rule.column,
          function: rule.function,
          type: 'unknown',
        });
        continue;
      }
      // Type floor: a hard SQL-validity rule (SUM/AVG only make sense on numbers) that
      // fires regardless of data-mart governance, so a bad override can't smuggle invalid SQL.
      if (rule.function === 'SUM' || rule.function === 'AVG') {
        const type = resolveType(rule.column);
        if (type !== undefined && !NUMBER_TYPES.has(type)) {
          errors.push({
            code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
            column: rule.column,
            function: rule.function,
            type,
          });
          continue;
        }
      }
      // Type floor (cont.): COUNT_DISTINCT / STRING_AGG need a value that is groupable
      // (DISTINCT) or text-castable. The `other` category — JSON, GEOGRAPHY, ARRAY,
      // STRUCT, SUPER, VARIANT — is neither, so every warehouse rejects it at run time.
      // Reject at save (a clean 400) rather than letting a save-clean config 500 on run.
      if (rule.function === 'COUNT_DISTINCT' || rule.function === 'STRING_AGG') {
        const type = resolveType(rule.column);
        if (type !== undefined && categorizeFieldType(type) === 'other') {
          errors.push({
            code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
            column: rule.column,
            function: rule.function,
            type,
          });
          continue;
        }
      }
      // Data-mart governance: the field's allowed set (derived by type, with per-field
      // override). Only enforced when the caller supplies the governance map.
      const allowed = resolveAllowed?.(rule.column);
      if (allowed !== undefined && !allowed.includes(rule.function)) {
        errors.push({
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
          column: rule.column,
          function: rule.function,
        });
      }
    }
    return errors;
  }

  validateDateTruncs(
    dateTruncs: DateTruncRule[],
    selectedColumns: ReadonlySet<string>,
    resolveType: (column: string) => string | undefined,
    aggregatedColumns: ReadonlySet<string>
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const rule of dateTruncs) {
      if (!selectedColumns.has(rule.column)) {
        errors.push({ code: 'DATE_TRUNC_COLUMN_NOT_SELECTED', column: rule.column });
        continue;
      }
      // A column can't be both a truncated dimension and an aggregated metric.
      if (aggregatedColumns.has(rule.column)) {
        errors.push({ code: 'DATE_TRUNC_COLUMN_IS_AGGREGATED', column: rule.column });
        continue;
      }
      const type = resolveType(rule.column);
      // L3: an unconfirmable type can't be guaranteed to be a date/timestamp — at run time
      // the dialect would attempt a varchar↔date coercion and fail loudly. Reject here (the
      // column is selected but absent from the resolved type map) rather than at run time.
      if (type === undefined) {
        errors.push({
          code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN',
          column: rule.column,
          type: 'unknown',
        });
        continue;
      }
      if (!DATE_TYPES.has(type)) {
        errors.push({ code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN', column: rule.column, type });
        continue;
      }
      // The tz is inlined into SQL as a literal — re-check the IANA shape here so a
      // malformed value surfaces a clear, column-scoped error (not just a Zod issue).
      if (rule.timeZone !== undefined && !IANA_TIME_ZONE_PATTERN.test(rule.timeZone)) {
        errors.push({
          code: 'DATE_TRUNC_INVALID_TIMEZONE',
          column: rule.column,
          timeZone: rule.timeZone,
        });
      }
      // A timeZone conversion requires a timestamp (sub-day) type. Applying it to a
      // pure DATE column emits invalid SQL: BigQuery DATE(col, 'tz') requires TIMESTAMP.
      // Guard: only fires when the column IS a date type but lacks a time component.
      if (
        rule.timeZone !== undefined &&
        type !== undefined &&
        DATE_TYPES.has(type) &&
        !TIMESTAMP_TYPES.has(type)
      ) {
        errors.push({
          code: 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP',
          column: rule.column,
          type,
        });
      }
    }
    return errors;
  }

  /**
   * Validates that every PROJECTED output column resolves to a unique name. The projected
   * set mirrors `resolveReportDataHeaders` / `renderAggregatedSelect`: an aggregated column
   * projects one `aggregatedColumnLabel(col, fn)` per function (and NO dimension), a
   * non-aggregated column projects its own name (date-trunc keeps the name), plus the
   * synthetic `Row Count` (when aggregated), `Unique Count` (when uniqueCount) and one
   * `<source>__unique_count` per joined source. A real
   * column whose name equals a synthetic label — or any two projected names that coincide —
   * is a duplicate alias on BigQuery / silent clobber on name-keyed readers. Uses the SAME
   * label helpers the renderer/header-generator use so this can never drift from the SELECT.
   */
  validateOutputColumnNames(
    projectedColumns: readonly string[],
    aggregations: AggregationRule[],
    includeRowCount: boolean,
    uniqueCount: boolean,
    joinedUniqueCountLabels: readonly string[] = []
  ): ValidationError[] {
    const names: string[] = [];
    for (const column of projectedColumns) {
      const fns = aggregationFunctionsForColumn(aggregations, column);
      if (fns.length === 0) {
        names.push(column);
      } else {
        for (const fn of fns) names.push(aggregatedColumnLabel(column, fn));
      }
    }
    if (includeRowCount) names.push(ROW_COUNT_LABEL);
    if (uniqueCount) names.push(UNIQUE_COUNT_LABEL);
    names.push(...joinedUniqueCountLabels);

    const errors: ValidationError[] = [];
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const name of names) {
      // Compared case-INSENSITIVELY: two output names differing only in case are not two
      // columns on most warehouses. Only Snowflake quotes every identifier; the other dialects
      // leave a safe one unquoted, and the engine then folds it (Athena, Redshift) or resolves
      // it case-insensitively (Spark) — the query projects both under one name, a metric
      // sleeve's join back on them is ambiguous, and a reader binding by name cannot tell them
      // apart. Applied to every storage rather than only the folding ones: the alternative is a
      // report that works on one warehouse and fails on the next.
      // Also cut to the tightest warehouse identifier limit before comparing. Redshift TRUNCATES
      // an over-long alias instead of rejecting it, so two long columns sharing a prefix come back
      // as ONE result column — and since the reader now binds by NAME it refuses the read rather
      // than mis-assigning values. Catching it here turns that 500 into a 400 that names the
      // column, on every warehouse, so the same report does not depend on which one runs it.
      const key = truncateIdentifierToByteLimit(name).toLowerCase();
      if (seen.has(key) && !reported.has(key)) {
        errors.push({ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: name });
        reported.add(key);
      }
      seen.add(key);
    }
    return errors;
  }

  async validateForReport(args: {
    storageType: DataStorageType;
    dataMartId: string;
    projectId: string;
    columnConfig: string[] | null | undefined;
    filterConfig: FilterConfig | null | undefined;
    sortConfig: SortConfig | null | undefined;
    limitConfig: number | null | undefined;
    aggregationConfig: AggregationConfig | null | undefined;
    dateTruncConfig?: DateTruncConfig | null | undefined;
    uniqueCountConfig?: UniqueCountConfig;
    accessor: BlendableSchemaAccessor;
    // Reuse an already-resolved schema (e.g. the totals path) instead of recomputing it.
    precomputedBlendableSchema?: BlendableSchemaDto;
    /**
     * Set by the paths that SAVE a config (create/update report, the MCP report tools) to reject a
     * joined Unique Count source that can never emit its column. The same method re-validates a
     * STORED config on every run, and there such a source is dropped from the SQL and the headers
     * alike by design — failing it would turn that degradation into a 400 on every schedule.
     */
    rejectUnavailableUniqueCountSources?: boolean;
  }): Promise<void> {
    const hasOutputControls =
      (args.filterConfig?.length ?? 0) > 0 ||
      (args.sortConfig?.length ?? 0) > 0 ||
      args.limitConfig != null ||
      (args.aggregationConfig?.length ?? 0) > 0 ||
      (args.dateTruncConfig?.length ?? 0) > 0 ||
      normalizeUniqueCountSources(args.uniqueCountConfig).length > 0;

    // A projection-only report carries no output control, so without this the early return below
    // would skip the schema a projected Unique Count column has to be checked against. It never
    // decides SUPPORT, though: on a storage without output controls there are no joined sources,
    // and a column of that shape is an ordinary field name.
    const mayProjectUniqueCountColumn =
      (args.columnConfig ?? []).some(
        column => column.endsWith(JOINED_UNIQUE_COUNT_NAME_SUFFIX) || column === UNIQUE_COUNT_LABEL
      ) && this.capabilityService.isSupported(args.storageType);

    if (!hasOutputControls && !mayProjectUniqueCountColumn) {
      // Output-name uniqueness is a property of the projection alone, so it is checked even
      // though a plain selection carries no output control — Redshift folds identifiers at read
      // time, and a case-only pair used to persist and fail there.
      if ((args.columnConfig?.length ?? 0) > 0) {
        this.throwIfInvalid(this.validateOutputColumnNames(args.columnConfig!, [], false, false));
      }
      return;
    }

    if (!this.capabilityService.isSupported(args.storageType)) {
      throw new BadRequestException({
        message: 'Output controls not yet supported for this storage type',
        details: {
          errors: [{ code: 'OUTPUT_CONTROLS_NOT_SUPPORTED', storageType: args.storageType }],
        },
      });
    }

    let parsedFilters: FilterRule[] = [];
    let parsedSort: SortRule[] = [];
    let parsedAggregations: AggregationRule[] = [];
    let parsedDateTruncs: DateTruncRule[] = [];
    if (args.filterConfig != null) {
      const result = FilterConfigSchema.safeParse(args.filterConfig);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Filter config has invalid shape',
          details: { errors: result.error.issues },
        });
      }
      parsedFilters = result.data ?? [];
    }
    if (args.sortConfig != null) {
      const result = SortConfigSchema.safeParse(args.sortConfig);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Sort config has invalid shape',
          details: { errors: result.error.issues },
        });
      }
      parsedSort = result.data ?? [];
    }
    if (args.aggregationConfig != null) {
      const result = AggregationConfigSchema.safeParse(args.aggregationConfig);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Aggregation config has invalid shape',
          details: { errors: result.error.issues },
        });
      }
      parsedAggregations = result.data ?? [];
    }
    if (args.dateTruncConfig != null) {
      const result = DateTruncConfigSchema.safeParse(args.dateTruncConfig);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Date-trunc config has invalid shape',
          details: { errors: result.error.issues },
        });
      }
      parsedDateTruncs = result.data ?? [];
    }

    const errors: ValidationError[] = [];

    const hasColumnConfig = (args.columnConfig?.length ?? 0) > 0;
    if (!hasColumnConfig && parsedFilters.some(r => r.placement === 'pre-join')) {
      errors.push({ code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' });
    }
    // Aggregations / date-truncs only project a column that is listed in columnConfig
    // (renderAggregatedSelect iterates the column list); a null/empty projection would
    // silently drop every metric and desync the headers from the SELECT. The MAIN Unique Count
    // and Row Count are synthetic columns that don't need a projected dimension, so they don't
    // trigger this requirement on their own.
    if (!hasColumnConfig && (parsedAggregations.length > 0 || parsedDateTruncs.length > 0)) {
      errors.push({ code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' });
    }
    // A JOINED Unique Count is a blended output control, and the blended builder needs an
    // explicit column list. Only a NULL/absent projection ("every native column") is malformed —
    // an explicit empty one is a legitimate metrics-only selection the builder handles. Rejecting
    // it here is what stops a report saving in a state that fails every subsequent run.
    if (args.columnConfig == null && joinedUniqueCountSources(args.uniqueCountConfig).length > 0) {
      errors.push({
        code: 'JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG',
        message:
          'A joined Data Mart’s Unique Count requires an explicit column selection on the report.',
      });
    }

    const needsSchema =
      parsedFilters.length > 0 ||
      parsedSort.length > 0 ||
      parsedAggregations.length > 0 ||
      parsedDateTruncs.length > 0 ||
      mayProjectUniqueCountColumn ||
      normalizeUniqueCountSources(args.uniqueCountConfig).length > 0;
    if (needsSchema) {
      const blendableSchema =
        args.precomputedBlendableSchema ??
        (await this.blendableSchemaService.computeBlendableSchema(
          args.dataMartId,
          args.projectId,
          args.accessor
        ));

      const hasActualizedSchema =
        blendableSchema.nativeFields.length > 0 || blendableSchema.blendedFields.length > 0;

      if (!hasActualizedSchema) {
        // A pre-join slice on a non-actualized schema can't be validated (no
        // fields to resolve against) and would otherwise be skipped — the run
        // path then hands the builder an empty fieldIndex and fails with a 500.
        // Surface the slice columns as disconnected (a 400) instead.
        const preJoinRefs = parsedFilters
          .filter(r => r.placement === 'pre-join')
          .map(r => r.column);
        if (preJoinRefs.length > 0) {
          throwDisconnectedReportColumnsError(args.dataMartId, preJoinRefs);
        }
      }

      if (hasActualizedSchema) {
        const homeFieldTypes = new Map<string, string>();
        const knownOutputColumns = new Set<string>();
        const connectedNativeNames: string[] = [];
        for (const native of collectSchemaFieldPathTypes(blendableSchema.nativeFields)) {
          homeFieldTypes.set(native.name, native.type);
          knownOutputColumns.add(native.name);
          connectedNativeNames.push(native.name);
        }
        for (const blended of blendableSchema.blendedFields) {
          if (blended.isHidden) continue;
          homeFieldTypes.set(blended.name, blended.type);
          knownOutputColumns.add(blended.name);
        }
        // Unique Count is always a KNOWN sort target (like a schema field) — whether it's
        // currently SELECTED (projected) depends on uniqueCountConfig, checked below by
        // validateSort. So a stale sort-by-Unique-Count left after disabling the toggle is
        // classified SORT_COLUMN_NOT_SELECTED (a 400) rather than routed to the harsher
        // DISCONNECTED_REPORT_COLUMNS path, which is reserved for names absent from the
        // schema entirely. NOTE: this is a code-level classification only — the web renders
        // just `message`, not `details.errors[].code`, so the two read the same to the user.
        // The web prunes this rule when the PK disappears, keeping the 400 largely unreachable.
        const uniqueCountOutputColumns = new Set<string>([UNIQUE_COUNT_LABEL]);
        // Same rule per joined source, keyed off the SCHEMA rather than the config for exactly the
        // reason above: unticking a source must leave its stale sort on the 400, not on the
        // disconnected message. A source the schema no longer offers stays disconnected.
        for (const source of blendableSchema.availableSources ?? []) {
          uniqueCountOutputColumns.add(buildJoinedUniqueCountColumnName(source.aliasPath));
        }
        for (const name of uniqueCountOutputColumns) knownOutputColumns.add(name);

        // A filter naming one of those columns is rejected HERE, and its rule is kept out of
        // validateFilters below: unknown to the field index, it would otherwise become
        // FILTER_COLUMN_UNKNOWN and route to throwDisconnectedReportColumnsError, which tells the
        // caller to repair a schema link that is not broken. Same honesty the MCP tool's
        // UniqueCountFieldUnsupportedClauseError already gives.
        // A real field may legitimately own one of these names — then it IS that field. Checked
        // against a set that KEEPS hidden blended fields, unlike `homeFieldTypes`: a field that
        // went hidden is a broken schema link, and the disconnected diagnosis names it and says
        // how to repair it. Calling it a Unique Count metric instead is simply false — the report
        // may have no Unique Count enabled at all.
        const realFieldNames = new Set([
          ...homeFieldTypes.keys(),
          ...blendableSchema.blendedFields.map(f => f.name),
        ]);
        const isUniqueCountColumn = (column: string) =>
          uniqueCountOutputColumns.has(column) && !realFieldNames.has(column);

        for (const rule of parsedFilters.filter(r => isUniqueCountColumn(r.column))) {
          errors.push({
            code: 'UNIQUE_COUNT_FILTER_UNSUPPORTED',
            column: rule.column,
            message: `"${rule.column}" is a Unique Count metric: it can be selected and sorted by, but not filtered or sliced. Remove the filter on it.`,
          });
        }
        const filtersToValidate = parsedFilters.filter(rule => !isUniqueCountColumn(rule.column));

        for (const rule of parsedAggregations.filter(r => isUniqueCountColumn(r.column))) {
          errors.push({
            code: 'UNIQUE_COUNT_AGGREGATION_UNSUPPORTED',
            column: rule.column,
            message: `"${rule.column}" is a Unique Count metric — already an aggregate, so it cannot be aggregated again. Remove the aggregation on it.`,
          });
        }
        const aggregationsToValidate = parsedAggregations.filter(
          rule => !isUniqueCountColumn(rule.column)
        );

        for (const rule of parsedDateTruncs.filter(r => isUniqueCountColumn(r.column))) {
          errors.push({
            code: 'UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED',
            column: rule.column,
            message: `"${rule.column}" is a Unique Count metric, not a date column, so it cannot be bucketed. Remove the date bucket on it.`,
          });
        }
        const dateTruncsToValidate = parsedDateTruncs.filter(
          rule => !isUniqueCountColumn(rule.column)
        );

        // The metric is emitted from `uniqueCountConfig`, never projected: a report listing its
        // column would resolve nothing at run time and fail with the disconnected-columns error,
        // which tells the caller to repair a schema that is not broken.
        for (const column of (args.columnConfig ?? []).filter(isUniqueCountColumn)) {
          errors.push({
            code: 'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE',
            column,
            message: `"${column}" is a Unique Count metric, not a column of this Data Mart: it is turned on by the report's Unique Count setting, not by listing it among the fields. Remove it from the field selection.`,
          });
        }

        if (filtersToValidate.length > 0) {
          const fieldIndex = buildBlendedFieldIndex(blendableSchema);
          errors.push(...this.validateFilters(filtersToValidate, homeFieldTypes, fieldIndex));
          // HAVING rules (filters carrying a `function`) are validated against the
          // configured aggregations + the aggregate's effective result type. `fieldIndex`
          // is reused here too — it also tells validateHavingFilters which columns are
          // BLENDED, to gate a HAVING COUNT_DISTINCT/SUM/AVG on a joined field ( sleeve gate).
          errors.push(
            ...this.validateHavingFilters(
              filtersToValidate,
              aggregationsToValidate,
              col => homeFieldTypes.get(col),
              args.storageType,
              fieldIndex
            )
          );
        }
        if (parsedSort.length > 0) {
          // With no explicit columnConfig the projection is `SELECT *` over the home
          // mart's NATIVE fields only — blended output aliases are NOT projected, and
          // the blended run path rejects output controls without an explicit column
          // selection. Validate sort against that same native-only set so a sort on a
          // blended column is caught here at save time instead of failing at run time.
          const selectedSet = new Set(args.columnConfig ?? connectedNativeNames);
          // Unique Count is a synthetic metric column (COUNT(DISTINCT <pk>)), not a
          // projected field — allow sorting by it whenever it's enabled. Each joined source's
          // metric is the same shape, and its sort resolves to the same outer SELECT alias, so it
          // is selected on exactly the same terms. The SQL-safe name, never the display label.
          if (hasMainUniqueCount(args.uniqueCountConfig)) selectedSet.add(UNIQUE_COUNT_LABEL);
          // Every CONFIGURED source, on the main metric's terms above — deliberately NOT gated on
          // the source still being emittable: `resolveUniqueCountSources` drops a source that lost
          // its key or its reporting inclusion, and the run path drops the stale sort rule with it
          // (BlendedReportDataService), so failing the rule here would 400 every scheduled run of
          // a report that no editor is ever opened on.
          for (const aliasPath of joinedUniqueCountSources(args.uniqueCountConfig)) {
            selectedSet.add(buildJoinedUniqueCountColumnName(aliasPath));
          }
          errors.push(...this.validateSort(parsedSort, selectedSet));
        }
        if (aggregationsToValidate.length > 0) {
          // Post-join aggregation over the (flat) blended result is an outer GROUP BY
          // on the final SELECT — validated against the selected output columns, which
          // now include non-hidden blended field names alongside the native fields.
          const selectedSet = new Set(args.columnConfig ?? connectedNativeNames);
          const allowedByColumn = this.buildAggregationGovernance(blendableSchema);
          errors.push(
            ...this.validateAggregations(
              aggregationsToValidate,
              selectedSet,
              col => homeFieldTypes.get(col),
              col => allowedByColumn.get(col)
            )
          );
        }
        if (dateTruncsToValidate.length > 0) {
          const selectedSet = new Set(args.columnConfig ?? connectedNativeNames);
          const aggregatedColumns = new Set(aggregationsToValidate.map(a => a.column));
          errors.push(
            ...this.validateDateTruncs(
              dateTruncsToValidate,
              selectedSet,
              col => homeFieldTypes.get(col),
              aggregatedColumns
            )
          );
        }

        // Unique Count emits a COUNT(DISTINCT <pk tuple>) column only when the data
        // mart has at least one primary-key field. Without a PK the SQL no-ops but
        // the header is still appended → header/column mismatch (silent data
        // corruption). Reject at save time so the bad state can never be persisted.
        if (hasMainUniqueCount(args.uniqueCountConfig)) {
          // From the schema's own answer, NOT re-derived from `nativeFields` — that list has had
          // hidden-for-reporting fields stripped, and a hidden key column is still counted.
          if ((blendableSchema.mainUniqueCountKeyFields ?? []).length === 0) {
            errors.push({
              code: 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY',
              message:
                'Unique Count requires at least one primary-key field defined on the data mart schema.',
            });
          }
        }

        // The same standard the main key is held to above, per joined source — but only where the
        // config can still be fixed: a stored one is re-validated on every run, where an unusable
        // source is dropped rather than fatal. A source merely EXCLUDED from reporting stays
        // saveable: the picker keeps its entry (rendered as not generated) so the user can clear
        // it, and blocking would trap every other edit to the report behind someone else's change.
        if (args.rejectUnavailableUniqueCountSources) {
          const sourceByPath = new Map(
            (blendableSchema.availableSources ?? []).map(s => [s.aliasPath, s])
          );
          for (const aliasPath of joinedUniqueCountSources(args.uniqueCountConfig)) {
            const source = sourceByPath.get(aliasPath);
            const reason = source
              ? unusableUniqueCountKeyReason(source.uniqueCountAvailability)
              : 'it is no longer joined to this Data Mart';
            if (!reason) continue;
            errors.push({
              code: 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE',
              aliasPath,
              message: `The joined Data Mart "${source?.defaultAlias || source?.title || aliasPath}" cannot supply its Unique Count: ${reason}. Remove it from the report’s Unique Count selection.`,
            });
          }
        }

        // The projected output column names (dimensions + aggregated labels + Row Count +
        // Unique Count, main and per joined source) must be unique — a collision is a duplicate
        // alias on BigQuery / a silent clobber on name-keyed readers. Row Count is automatic for
        // an aggregated report (the run path appends it; the Totals reader opts out but never
        // runs this). Mirror resolveReportDataHeaders: a metrics-only report (aggregations /
        // any Unique Count) with NO explicit projection emits no dimensions, so don't count
        // native names there.
        const joinedUniqueCounts = joinedUniqueCountSources(args.uniqueCountConfig);
        const isMetricsOnly = isMetricsOnlyProjection(parsedAggregations, args.uniqueCountConfig);
        const projectedColumns = hasColumnConfig
          ? args.columnConfig!
          : isMetricsOnly
            ? []
            : connectedNativeNames;
        errors.push(
          ...this.validateOutputColumnNames(
            projectedColumns,
            aggregationsToValidate,
            aggregationsToValidate.length > 0,
            hasMainUniqueCount(args.uniqueCountConfig),
            // `orders__unique_count` is byte-identical to the unified name of a real flat field
            // called `unique_count` on that source — select both and the alias is emitted twice.
            joinedUniqueCounts.map(buildJoinedUniqueCountColumnName)
          )
        );

        const disconnectedOutputControlRefs = this.collectDisconnectedOutputControlRefs(
          errors,
          parsedSort,
          knownOutputColumns
        );
        if (disconnectedOutputControlRefs.length > 0) {
          throwDisconnectedReportColumnsError(args.dataMartId, disconnectedOutputControlRefs);
        }
      }
    }

    this.throwIfInvalid(errors);
  }

  private throwIfInvalid(errors: ValidationError[]): void {
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors },
      });
    }
  }

  /**
   * Builds the per-column aggregation allowed-set used to validate post-join
   * aggregation. Native fields carry their dimension/metric role and any per-field
   * override; joined (blended) fields are governed by their DM-level
   * `postJoinAggregations` when set, falling back to type-derived defaults.
   */
  private buildAggregationGovernance(blendableSchema: {
    nativeFields: Parameters<typeof collectSchemaFieldPathDescriptors>[0];
    blendedFields: {
      name: string;
      type: string;
      isHidden?: boolean;
      postJoinAggregations?: ReportAggregateFunction[];
    }[];
  }): Map<string, ReportAggregateFunction[]> {
    const allowedByColumn = new Map<string, ReportAggregateFunction[]>();
    for (const { name, type, field } of collectSchemaFieldPathDescriptors(
      blendableSchema.nativeFields
    )) {
      allowedByColumn.set(
        name,
        resolveFieldGovernance(type, {
          aggregationRole: field.aggregationRole as AggregationRole | undefined,
          allowedAggregations: field.allowedAggregations as ReportAggregateFunction[] | undefined,
        }).allowedAggregations
      );
    }
    for (const blended of blendableSchema.blendedFields) {
      if (blended.isHidden) continue;
      // `blendable-schema.service` already clamps a stored override to the effective type's
      // supported set, so this menu is legal by the time it arrives; keep the fallback for a
      // schema assembled without that service.
      allowedByColumn.set(
        blended.name,
        resolveFieldGovernance(blended.type, {
          allowedAggregations: blended.postJoinAggregations,
        }).allowedAggregations
      );
    }
    return allowedByColumn;
  }

  private collectDisconnectedOutputControlRefs(
    errors: ValidationError[],
    sort: SortRule[],
    knownOutputColumns: ReadonlySet<string>
  ): string[] {
    const refs: string[] = [];

    for (const error of errors) {
      switch (error.code) {
        case 'FILTER_COLUMN_UNKNOWN':
        case 'FILTER_ALIAS_PATH_UNKNOWN':
          refs.push(this.formatFilterRef(error.column, error.aliasPath));
          break;
        case 'FILTER_ALIAS_PATH_NOT_INCLUDED':
          // column is the unified name — use it directly as the disconnected ref.
          refs.push(error.column);
          break;
      }
    }

    for (const rule of sort) {
      if (!knownOutputColumns.has(rule.column)) {
        refs.push(rule.column);
      }
    }

    return Array.from(new Set(refs));
  }

  private formatFilterRef(column: string, aliasPath?: string): string {
    return aliasPath ? `${aliasPath}.${column}` : column;
  }
}
