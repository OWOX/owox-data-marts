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
  collectSchemaFieldPathTypes,
  collectSchemaFieldPathDescriptors,
  getPrimaryKeyFields,
} from '../data-storage-types/data-mart-schema.utils';
import { buildBlendedFieldIndex } from './blended-field-index';
import { BlendedFieldEntry } from '../data-storage-types/interfaces/blended-query-builder.interface';
import {
  STRING_TYPES,
  NUMBER_TYPES,
  DATE_TYPES,
  TIME_TYPES,
  BOOL_TYPES,
} from '../dto/schemas/field-type-category';
import {
  resolveFieldGovernance,
  AggregationRole,
} from '../dto/schemas/field-aggregation-governance';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { computeEffectiveType } from '../data-storage-types/field-aggregation';
import { StorageFieldType } from '../dto/domain/storage-field-type';
import {
  ROW_COUNT_LABEL,
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../dto/schemas/aggregation-labels';

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
  // An aggregated / date-trunc report needs an explicit column projection: the SELECT
  // builder only emits a metric/date-trunc column when it is listed in columnConfig, so a
  // null/empty columnConfig would silently drop every metric (and produce a header set that
  // no longer matches the SELECT). Require the projection up front.
  | { code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' }
  // Two projected output columns resolve to the SAME output name — a dimension whose name
  // equals a synthetic label (Row Count / Unique Count / "<col> | TOKEN"), or any
  // two projected columns colliding. Duplicate alias error on BigQuery / silent clobber on
  // name-keyed readers. `label` is the colliding output name.
  | { code: 'OUTPUT_COLUMN_NAME_COLLISION'; label: string };

// Valid for any column type, including ones not in the sets above.
const TYPE_AGNOSTIC_OPS = new Set(['is_null', 'is_not_null']);

const STRING_OPS = new Set([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
  'regex',
  'not_regex',
]);
const NUMBER_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'is_null',
  'is_not_null',
]);
const DATE_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'relative_date',
  'is_null',
  'is_not_null',
]);
// Same comparison ops as DATE_OPS minus relative_date (date-arithmetic presets).
const TIME_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'is_null',
  'is_not_null',
]);
const BOOL_OPS = new Set(['is_true', 'is_false', 'is_null', 'is_not_null']);

function operatorAllowed(fieldType: string, operator: string): boolean {
  if (TYPE_AGNOSTIC_OPS.has(operator)) return true;
  if (STRING_TYPES.has(fieldType)) return STRING_OPS.has(operator);
  if (NUMBER_TYPES.has(fieldType)) return NUMBER_OPS.has(operator);
  if (DATE_TYPES.has(fieldType)) return DATE_OPS.has(operator);
  if (TIME_TYPES.has(fieldType)) return TIME_OPS.has(operator);
  if (BOOL_TYPES.has(fieldType)) return BOOL_OPS.has(operator);
  return false;
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
        this.validateRuleAgainstType(rule, f.type, f.aliasPath, errors);
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
   */
  validateHavingFilters(
    filters: FilterRule[],
    aggregations: AggregationRule[],
    resolveType: (column: string) => string | undefined,
    storageType: DataStorageType
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const aggregatedPairs = new Set(aggregations.map(a => `${a.column}\u241F${a.function}`));
    for (const rule of filters) {
      if (!rule.function) continue;
      if (!aggregatedPairs.has(`${rule.column}\u241F${rule.function}`)) {
        errors.push({
          code: 'HAVING_FILTER_NOT_AGGREGATED',
          column: rule.column,
          function: rule.function,
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
   * synthetic `Row Count` (when aggregated) and `Unique Count` (when uniqueCount). A real
   * column whose name equals a synthetic label — or any two projected names that coincide —
   * is a duplicate alias on BigQuery / silent clobber on name-keyed readers. Uses the SAME
   * label helpers the renderer/header-generator use so this can never drift from the SELECT.
   */
  validateOutputColumnNames(
    projectedColumns: readonly string[],
    aggregations: AggregationRule[],
    includeRowCount: boolean,
    uniqueCount: boolean
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

    const errors: ValidationError[] = [];
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const name of names) {
      if (seen.has(name) && !reported.has(name)) {
        errors.push({ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: name });
        reported.add(name);
      }
      seen.add(name);
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
    uniqueCountConfig?: boolean | null | undefined;
    accessor: BlendableSchemaAccessor;
    // Reuse an already-resolved schema (e.g. the totals path) instead of recomputing it.
    precomputedBlendableSchema?: BlendableSchemaDto;
  }): Promise<void> {
    const hasOutputControls =
      (args.filterConfig?.length ?? 0) > 0 ||
      (args.sortConfig?.length ?? 0) > 0 ||
      args.limitConfig != null ||
      (args.aggregationConfig?.length ?? 0) > 0 ||
      (args.dateTruncConfig?.length ?? 0) > 0 ||
      args.uniqueCountConfig === true;
    if (!hasOutputControls) return;

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
    // silently drop every metric and desync the headers from the SELECT. Unique Count and
    // Row Count are synthetic columns that don't need a projected dimension, so they don't
    // trigger this requirement on their own.
    if (!hasColumnConfig && (parsedAggregations.length > 0 || parsedDateTruncs.length > 0)) {
      errors.push({ code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' });
    }

    const needsSchema =
      parsedFilters.length > 0 ||
      parsedSort.length > 0 ||
      parsedAggregations.length > 0 ||
      parsedDateTruncs.length > 0 ||
      args.uniqueCountConfig === true;
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

        if (parsedFilters.length > 0) {
          const fieldIndex = buildBlendedFieldIndex(blendableSchema);
          errors.push(...this.validateFilters(parsedFilters, homeFieldTypes, fieldIndex));
          // HAVING rules (filters carrying a `function`) are validated against the
          // configured aggregations + the aggregate's effective result type.
          errors.push(
            ...this.validateHavingFilters(
              parsedFilters,
              parsedAggregations,
              col => homeFieldTypes.get(col),
              args.storageType
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
          errors.push(...this.validateSort(parsedSort, selectedSet));
        }
        if (parsedAggregations.length > 0) {
          // Post-join aggregation over the (flat) blended result is an outer GROUP BY
          // on the final SELECT — validated against the selected output columns, which
          // now include non-hidden blended field names alongside the native fields.
          const selectedSet = new Set(args.columnConfig ?? connectedNativeNames);
          const allowedByColumn = this.buildAggregationGovernance(blendableSchema);
          errors.push(
            ...this.validateAggregations(
              parsedAggregations,
              selectedSet,
              col => homeFieldTypes.get(col),
              col => allowedByColumn.get(col)
            )
          );
        }
        if (parsedDateTruncs.length > 0) {
          const selectedSet = new Set(args.columnConfig ?? connectedNativeNames);
          const aggregatedColumns = new Set(parsedAggregations.map(a => a.column));
          errors.push(
            ...this.validateDateTruncs(
              parsedDateTruncs,
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
        if (args.uniqueCountConfig === true) {
          const pkFields = getPrimaryKeyFields(blendableSchema.nativeFields);
          if (pkFields.length === 0) {
            errors.push({
              code: 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY',
              message:
                'Unique Count requires at least one primary-key field defined on the data mart schema.',
            });
          }
        }

        // The projected output column names (dimensions + aggregated labels + Row Count +
        // Unique Count) must be unique — a collision is a duplicate alias on BigQuery / a
        // silent clobber on name-keyed readers. Row Count is automatic for an aggregated
        // report (the run path appends it; the Totals reader opts out but never runs this).
        // Mirror resolveReportDataHeaders: a metrics-only report (aggregations / uniqueCount)
        // with NO explicit projection emits no dimensions, so don't count native names there.
        const isMetricsOnly = parsedAggregations.length > 0 || args.uniqueCountConfig === true;
        const projectedColumns = hasColumnConfig
          ? args.columnConfig!
          : isMetricsOnly
            ? []
            : connectedNativeNames;
        errors.push(
          ...this.validateOutputColumnNames(
            projectedColumns,
            parsedAggregations,
            parsedAggregations.length > 0,
            args.uniqueCountConfig === true
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
      allowedByColumn.set(
        blended.name,
        blended.postJoinAggregations ?? resolveFieldGovernance(blended.type).allowedAggregations
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
