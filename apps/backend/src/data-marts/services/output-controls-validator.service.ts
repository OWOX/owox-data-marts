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
import { implicitAllNativeColumnNames } from './http-data/http-data-column-sets.util';
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
import {
  brokenJoinedReferencesOf,
  brokenReferencesOf,
  buildJoinedReferenceIndex,
  calculatedFieldLevelOf,
  calculatedFieldsOf,
  joinedCalculatedFieldRefusals,
  readsJoinedDataMart,
} from '../calculated-fields/calculated-field.utils';
import { routeFilterClauses } from '../calculated-fields/filter-clause-routing';
import { isHavingFilterRule } from '../dto/domain/filter-clause';
import { isAggregateLevel, type CalculatedFieldLevel } from '../calculated-fields/formula-level';
import type { DataMartSchema } from '../data-storage-types/data-mart-schema.type';

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
  // A date bucket on a CALCULATED field carries a time zone (#6732 §6.1). The bucket itself stays;
  // only this leg goes, and on all five storages rather than per dialect. Measured on Snowflake
  // 2026-08-24: a TIMESTAMP-declared row-level formula over the string '05/08/2026', bucketed by
  // MONTH in `America/New_York`, returned `2026-05-01T04:00:00Z` — the 8th of May where the formula
  // means the 5th of August. One row, no error, no NULL. The zone is the door: `CONVERT_TIMEZONE`
  // is the only string shape Snowflake returns a value for instead of refusing, and it is the
  // coercion that parses the string — MDY, under a session default rather than anything in the
  // data. A cast is not the remedy: §1.2 measured the same wrong date from one on Redshift.
  | { code: 'DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD'; column: string; timeZone: string }
  | { code: 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY'; message: string }
  // A HAVING filter (rule carries `function`) must target a configured aggregation —
  // i.e. the (column, function) pair must exist in aggregationConfig.
  | { code: 'HAVING_FILTER_NOT_AGGREGATED'; column: string; function: string }
  // A HAVING filter is inherently post-aggregation and cannot be pushed pre-join: the blended
  // builder routes a pre-join rule to a CTE where such rules are dropped, so the constraint would
  // apply NOWHERE. `function` is absent for the one HAVING shape that carries none — an
  // AGGREGATE-level Calculated Field's rule, whose clause comes off its LEVEL (#6732, D21).
  | { code: 'HAVING_FILTER_INVALID_PLACEMENT'; column: string; function?: string }
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
  // The same requirement reached through a different door: a filter on an AGGREGATE-LEVEL
  // Calculated Field forces the aggregated shape on its own — the field need not be selected to
  // be filtered on — so with no projection the aggregated branch has nothing to put in the SELECT
  // list. `AGGREGATION_REQUIRES_COLUMN_CONFIG` cannot catch it: that one keys on aggregations and
  // date truncs, and this shape carries neither.
  | { code: 'CALCULATED_METRIC_FILTER_REQUIRES_COLUMN_CONFIG'; column: string; message: string }
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
  // equals a synthetic label (Unique Count / "<col> | TOKEN"), or any
  // two projected columns colliding, INCLUDING a pair that differs only in letter case.
  // Duplicate alias error on BigQuery / silent clobber on name-keyed readers. `label` is the
  // colliding output name.
  | { code: 'OUTPUT_COLUMN_NAME_COLLISION'; label: string }
  // An aggregation applied to an AGGREGATE-level calculated field, which IS an aggregate already
  // (spec §2.3). Only that level: slice 3 built the substitution-into-the-aggregate mechanism, so
  // a rule on a ROW-LEVEL field is no longer an error at all. `level` therefore always reads
  // 'metric' here now, and is kept because it is what makes that fact visible on the wire.
  | {
      code: 'AGGREGATION_ON_CALCULATED_METRIC';
      column: string;
      message: string;
      level: CalculatedFieldLevel;
    }
  // A calculated field named by a dateTrunc rule — the one shape that explicitly asks to group
  // BY it. An aggregate-level one is never a dimension at all: `excludeCalculatedMetricNames`
  // keeps it out of the plain GROUP BY inference regardless of what else in the report is
  // aggregated (spec §2.3). Only that level, exactly as the sibling above: slice 3b built the
  // bucketing, so a rule on a ROW-LEVEL field is no longer an error here at all — it is checked
  // against its DECLARED type by `validateDateTruncs`, like any column. `level` therefore always
  // reads 'metric' here now, and is kept because it is what makes that fact visible on the wire.
  | {
      code: 'CALCULATED_METRIC_AS_DIMENSION';
      column: string;
      message: string;
      level: CalculatedFieldLevel;
    }
  // A calculated metric selected/filtered/sorted by this composition references a schema field
  // that no longer resolves (see `brokenReferencesOf`) — fails the query explicitly rather than
  // returning NULL (spec §7).
  | { code: 'CALCULATED_METRIC_BROKEN_REFERENCES'; column: string; message: string }
  // A filter names an AGGREGATE-level Calculated Field whose formula aggregates a JOINED Data
  // Mart (#6732, D22). Exactly its ordinary-metric twin above, one shape further out: that
  // aggregate is lifted into a metric sleeve — recomputed at the report's grain from the raw,
  // pre-dedup path — while the predicate would be rendered from the dedup CTE, so it would filter
  // on a different value than the SELECT prints. Not expressible through the twin: the twin is
  // keyed on the (column, function) pair, and this rule carries no function and never can.
  | {
      code: 'HAVING_ON_BLENDED_SLEEVE_CALCULATED_METRIC_NOT_SUPPORTED';
      column: string;
      message: string;
    }
  // A report surface — projection, filter, sort, aggregation or date bucket — names a JOINED Data
  // Mart's calculated field. Every code above keys off the MAIN Data Mart's own fields, so none of
  // them ever saw a blended name, and the field was then projected from the joined mart's physical
  // table by its `originalFieldName`: an unrecognised name, or a silently wrong number where that
  // table still carries a column of that name (see `joinedCalculatedFieldRefusals`).
  | { code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED'; column: string; message: string };

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
      // Post-aggregation rules are HAVING — validated by validateHavingFilters against the
      // aggregate's effective type, not here. Which clause a rule belongs in is the verdict it
      // CARRIES (#6732, D21), never `rule.function`: an AGGREGATE-level Calculated Field's rule
      // carries no function and never can, and type-checked here it would be read as a WHERE.
      if (isHavingFilterRule(rule)) continue;
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
      // The clause is the verdict the rule CARRIES (#6732, D21). A rule that lands here with NO
      // function is an AGGREGATE-level Calculated Field's: its formula is already an aggregate,
      // so it has no `(column, function)` pair to demand and no aggregate function to widen a type
      // through. Every check below that reads `rule.function` is guarded on it for that reason,
      // and the guards that do NOT read it (the placement, and the operator/type check at the
      // bottom) are exactly the ones this shape still needs.
      if (!isHavingFilterRule(rule)) continue;
      // A HAVING is post-aggregation; it cannot be pushed pre-join. On the blended path a
      // pre-join rule is routed to a CTE where such rules are dropped, so the constraint would
      // apply nowhere (silent wrong rows), and for a function-less one `partitionBlendedFilters`
      // throws a raw Error instead: a 500 where the caller is owed a 400. Reject the combo here.
      if (rule.placement === 'pre-join') {
        errors.push({
          code: 'HAVING_FILTER_INVALID_PLACEMENT',
          column: rule.column,
          ...(rule.function ? { function: rule.function } : {}),
        });
        continue;
      }
      // NOT asked of a function-less rule: an aggregate-level Calculated Field can never appear in
      // `aggregationConfig` (AGGREGATION_ON_CALCULATED_METRIC refuses it outright), so this check
      // would fail on a `<column>/undefined` key and answer "add the matching aggregation", the
      // one repair the field forbids.
      if (rule.function && !aggregatedPairs.has(`${rule.column}\u241F${rule.function}`)) {
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
      if (
        rule.function &&
        SLEEVE_ROUTED_FUNCTIONS.has(rule.function) &&
        blendedFieldIndex.has(rule.column)
      ) {
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
      // No function to widen through: an aggregate-level Calculated Field's predicate compares the
      // formula itself, so its DECLARED type (D3) is already the effective one.
      const effectiveType = rule.function
        ? computeEffectiveType(rawType as StorageFieldType, rule.function, storageType)
        : rawType;
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
    aggregatedColumns: ReadonlySet<string>,
    /** The mart's own calculated fields, which are refused the time-zone leg alone (#6732 §6.1). */
    calculatedColumns: ReadonlySet<string> = new Set()
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
      // #6732 §6.1 — the ONE shape D16's no-cast rendering can still be silently wrong in.
      // `continue` rather than fall through: every remaining check is about the same time zone,
      // and a second verdict on a value that has to go regardless only buries the fix.
      if (rule.timeZone !== undefined && calculatedColumns.has(rule.column)) {
        errors.push({
          code: 'DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD',
          column: rule.column,
          timeZone: rule.timeZone,
        });
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
   * synthetic `Unique Count` (when uniqueCount) and one
   * `<source>__unique_count` per joined source. A real
   * column whose name equals a synthetic label — or any two projected names that coincide —
   * is a duplicate alias on BigQuery / silent clobber on name-keyed readers. Uses the SAME
   * label helpers the renderer/header-generator use so this can never drift from the SELECT.
   */
  validateOutputColumnNames(
    projectedColumns: readonly string[],
    aggregations: AggregationRule[],
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
    /**
     * The Data Mart's OWN schema fields, exactly as stored (`dataMart.schema?.fields`) — NOT the
     * reporting-filtered `nativeFields` of the blendable schema. Two jobs:
     *
     * 1. It answers "could this report carry a calculated metric at all?" without a schema fetch.
     *    Inferring that from `columnConfig` alone made EVERY projecting report resolve the
     *    blendable schema — a mart fetch plus every relationship for the storage plus a recursive
     *    joined-mart walk — and made a plain report fail to save whenever some unrelated
     *    relationship pointed at a soft-deleted mart.
     * 2. It is the list a formula's references are resolved against. `nativeFields` has had
     *    `isHiddenForReporting` fields stripped, and a hidden field is still legal inside a
     *    formula (spec §7 — hidden takes a column off the reporting menu, it does not remove it
     *    from the source, and computing is not projecting). Resolving against the filtered list
     *    reports a metric over a hidden column as broken on every read.
     *
     * It is also the exact list `ReportSqlComposerService.compose` reads its metrics from, so the
     * two cannot disagree about which fields are metrics.
     *
     * REQUIRED, not optional — deliberately, even though the VALUE may be `undefined`. Dropping
     * the property silently flipped the metric guards over to `blendableSchema.nativeFields`
     * (job 2 above), which is the regression that reported every metric over a hidden column as
     * broken on every read. As a required property, deleting the line is a build error instead.
     * `undefined` now means one thing only: this Data Mart has NO schema yet — so it has no
     * calculated field either, and the cheap path is the correct answer, not a guess.
     */
    dataMartSchemaFields: DataMartSchema['fields'] | undefined;
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

    const hasColumnConfig = (args.columnConfig?.length ?? 0) > 0;

    // A projection-only report carries no output control, so without this the early return below
    // would skip the schema a projected Unique Count column has to be checked against. It never
    // decides SUPPORT, though: on a storage without output controls there are no joined sources,
    // and a column of that shape is an ordinary field name.
    const mayProjectUniqueCountColumn =
      (args.columnConfig ?? []).some(
        column => column.endsWith(JOINED_UNIQUE_COUNT_NAME_SUFFIX) || column === UNIQUE_COUNT_LABEL
      ) && this.capabilityService.isSupported(args.storageType);

    // A calculated metric's name carries no cheap marker the way Unique Count's fixed suffix
    // does, so whether a bare projection carries one is answered by the Data Mart's own schema
    // fields — which every caller already holds — and NOT by "it projects something, so it might".
    // That reading was true of every report with a projection, on every storage, and it dragged
    // three costs onto reports that have no formula anywhere near them: a blendable-schema
    // resolution where there was none, a save failure whenever an unrelated relationship targeted
    // a soft-deleted Data Mart, and the loss of the projection-only output-name collision check.
    // Gated on capability too — the same gate `compose()` applies before it will render a metric.
    //
    // This is the composition-time chokepoint spec §6.3 (decision 10) requires on every composing
    // surface, and it is NOT redundant with save-time formula validation:
    // `ActualizeDataMartSchemaService` writes `dataMart.schema` after every warehouse
    // actualization without running `CalculatedFieldValidatorService` (that validator is wired
    // only into `update-data-mart-schema.service.ts`, the analyst-facing save path), and the
    // schema mergers carry a calculated field through untouched on every merge — so a formula can
    // silently outlive a column it depends on. Without this, the first sign of trouble would be a
    // warehouse error on a scheduled run of an already-saved report — see `brokenReferencesOf`.
    //
    // Narrowed to THIS report's own selection, not to "the mart owns one somewhere": every guard
    // inside the heavy path that a bare projection can trip (the broken-reference check, the
    // blended refusal) keys off a SELECTED metric, and the ones that key off a filter, a sort, an
    // aggregation or a date bucket are already covered by `hasOutputControls` above. Left
    // mart-wide, one calculated field anywhere removed the early return from EVERY projecting
    // report on that Data Mart — a blendable-schema resolution each, for a report that never
    // mentions the formula.
    //
    // A Data Mart with NO schema at all (`dataMartSchemaFields === undefined`) takes the cheap
    // path too: it owns no calculated field, so there is no guard to skip. The parameter is
    // required, so that is a fact about the mart rather than a caller's omission.
    const selectedColumns = new Set(args.columnConfig ?? []);
    const mayCarryCalculatedMetric =
      hasColumnConfig &&
      this.capabilityService.isSupported(args.storageType) &&
      calculatedFieldsOf(args.dataMartSchemaFields ?? []).some(field =>
        selectedColumns.has(field.name)
      );

    if (!hasOutputControls && !mayProjectUniqueCountColumn && !mayCarryCalculatedMetric) {
      // Output-name uniqueness is a property of the projection alone, so it is checked even
      // though a plain selection carries no output control — Redshift folds identifiers at read
      // time, and a case-only pair used to persist and fail there.
      if (hasColumnConfig) {
        this.throwIfInvalid(this.validateOutputColumnNames(args.columnConfig!, [], false));
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

    if (!hasColumnConfig && parsedFilters.some(r => r.placement === 'pre-join')) {
      errors.push({ code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' });
    }
    // Aggregations / date-truncs only project a column that is listed in columnConfig
    // (renderAggregatedSelect iterates the column list); a null/empty projection would
    // silently drop every metric and desync the headers from the SELECT. The MAIN Unique Count
    // is a synthetic column that doesn't need a projected dimension, so it doesn't
    // trigger this requirement on its own.
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

    // Resolved against the Data Mart's OWN schema fields — see the `metricSchemaFields` note
    // inside the actualized branch below for why that list and not `blendableSchema.nativeFields`.
    //
    // HOISTED out of `if (hasActualizedSchema)` deliberately (#6732, spec §7): the guards that
    // live in there skip EVERY calculated-field check for a Data Mart whose schema has not been
    // actualized yet, and a refusal about what a formula DOES needs no warehouse schema at all.
    const metricSchemaFields = args.dataMartSchemaFields ?? [];
    const calculated = new Map(calculatedFieldsOf(metricSchemaFields).map(f => [f.name, f]));
    // The clause each rule belongs in, decided once from the rule and the field's LEVEL and
    // carried on the rule (#6732, D21) — the same seat the composer stamps with, so what this
    // validates and what the builder renders cannot disagree about which clause a predicate is in.
    const routedFilters = routeFilterClauses(parsedFilters, metricSchemaFields);
    // Columns whose filter rule is refused below, so no second verdict is stacked on them.
    const refusedCalculatedFilterColumns = new Set<string>();
    for (const rule of routedFilters) {
      const field = calculated.get(rule.column);
      if (!field) continue;
      if (!isAggregateLevel(calculatedFieldLevelOf(field, metricSchemaFields))) continue;
      // An aggregation ON an aggregate-level field, arriving through a filter rather than through
      // `aggregationConfig`. Raised with the aggregation code rather than left to
      // HAVING_FILTER_NOT_AGGREGATED, which would answer "add the matching aggregation" — the one
      // repair this field forbids outright.
      if (rule.function) {
        refusedCalculatedFilterColumns.add(rule.column);
        errors.push({
          code: 'AGGREGATION_ON_CALCULATED_METRIC',
          column: rule.column,
          level: 'metric',
          message: `\`${rule.column}\` is a calculated field and is already aggregated.`,
        });
        continue;
      }
      // D22. Built on the LEVEL plus what the formula READS, never on the column-plus-function
      // key the ordinary-metric twin uses: this rule carries no function, so that key is blind
      // to it by construction.
      if (!readsJoinedDataMart(field)) continue;
      refusedCalculatedFilterColumns.add(rule.column);
      errors.push({
        code: 'HAVING_ON_BLENDED_SLEEVE_CALCULATED_METRIC_NOT_SUPPORTED',
        column: rule.column,
        message:
          `Filter on the calculated field "${rule.column}", whose formula aggregates a joined ` +
          '(blended) Data Mart, is not yet supported: the post-join filter cannot be routed ' +
          'through the same dedup-safe computation used for the SELECT value, so it would filter ' +
          'on a different, incorrect value. Remove this filter, or filter on a MAIN ' +
          '(non-blended) column instead.',
      });
    }

    // The report asked for the whole native projection and then filtered on an aggregate-level
    // Calculated Field. That filter alone flips the query to the aggregated shape, where only
    // LISTED columns are projected — so the SELECT list came out empty and the whole projection
    // was silently discarded, on top of the syntax error that produced. Refused here so the
    // analyst is told which field forced it, rather than meeting it as a warehouse error on every
    // run and every Generated-SQL preview.
    //
    // Row Count and a MAIN Unique Count are synthetic columns that project without a dimension,
    // so a report carrying one is not empty and is left alone — the same carve-out
    // AGGREGATION_REQUIRES_COLUMN_CONFIG makes.
    if (
      !hasColumnConfig &&
      parsedAggregations.length === 0 &&
      parsedDateTruncs.length === 0 &&
      normalizeUniqueCountSources(args.uniqueCountConfig).length === 0
    ) {
      const forcing = routedFilters.find(rule => {
        if (refusedCalculatedFilterColumns.has(rule.column)) return false;
        const field = calculated.get(rule.column);
        return (
          field !== undefined && isAggregateLevel(calculatedFieldLevelOf(field, metricSchemaFields))
        );
      });
      if (forcing) {
        errors.push({
          code: 'CALCULATED_METRIC_FILTER_REQUIRES_COLUMN_CONFIG',
          column: forcing.column,
          message:
            `Filtering on the calculated field "${forcing.column}" groups the report, so the ` +
            'report must select at least one column. Add a column to the selection, or remove ' +
            'the filter.',
        });
      }
    }

    const needsSchema =
      parsedFilters.length > 0 ||
      parsedSort.length > 0 ||
      parsedAggregations.length > 0 ||
      parsedDateTruncs.length > 0 ||
      mayProjectUniqueCountColumn ||
      mayCarryCalculatedMetric ||
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
        // Output-name uniqueness is a property of the PROJECTION alone and needs no schema, so an
        // unactualized Data Mart must not be the one way to persist a case-only duplicate. The
        // projection-only early return above runs this check; a report that leaves that path (any
        // output control, a projected Unique Count column, a calculated metric) used to lose it
        // entirely whenever the schema had not been actualized yet. Same call shape as the
        // actualized branch below, minus the Unique-Count column classification, which is exactly
        // the part that needs a schema.
        if (hasColumnConfig) {
          errors.push(
            ...this.validateOutputColumnNames(
              args.columnConfig!,
              parsedAggregations,
              hasMainUniqueCount(args.uniqueCountConfig),
              joinedUniqueCountSources(args.uniqueCountConfig).map(buildJoinedUniqueCountColumnName)
            )
          );
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

        // Composition-time guards for a calculated metric — spec §6.3, decision 10. Run first,
        // ahead of the ordinary filter/sort/aggregation checks below, so a metric that is misused
        // or broken is reported as such rather than as a stale "column not selected" / "unknown
        // column" message that sends the caller to repair a schema link that is not broken. Every
        // real composing surface reaches this: `resolveBlendingDecision` calls `validateForReport`
        // as its own single chokepoint (reports, MCP, and the HTTP Data ad-hoc endpoint alike), so
        // a guard added here does not need repeating per surface.
        //
        // Resolved against the Data Mart's OWN schema fields, not `blendableSchema.nativeFields`:
        // that list has had `isHiddenForReporting` fields stripped, and a hidden field is legal
        // inside a formula (spec §7 — hidden takes a column off the reporting menu, it does not
        // remove it from the source, and computing is not projecting). Handing the filtered list
        // to `brokenReferencesOf` — which is built on a traversal that deliberately KEEPS hidden
        // fields — reported every metric over a hidden column as broken, on every report save,
        // run, HTTP Data call and MCP query. It is also the list `compose()` reads its metrics
        // from, so what this validates and what the composer renders cannot diverge.
        //
        // NOT `?? blendableSchema.nativeFields`: that fallback is the very substitution described
        // above, one dropped argument away, and it is unnecessary — `dataMartSchemaFields` is a
        // required property, so `undefined` means the Data Mart has no schema at all and therefore
        // owns no calculated field either.
        //
        // `metricSchemaFields` and `calculated` are resolved ABOVE this branch, because the D22
        // filter refusal needs them and must not inherit this branch's blind spot (see there).
        if (calculated.size > 0) {
          // An aggregate-level calculated field IS an aggregate (spec §2.3); wrapping it in
          // another aggregation is the same class of error as aggregating an already-aggregated
          // Unique Count. A ROW-LEVEL one is not refused at all since slice 3: the renderer
          // substitutes its expression inside the aggregate, and the field stops being a grouping
          // key. Nothing was ADDED to let it through — it simply stops being intercepted here and
          // reaches `validateAggregations` like any column, where its DECLARED type (spec §2.1,
          // D3) is in `homeFieldTypes` and `buildAggregationGovernance` has resolved an entry from
          // it. That is the whole mechanism: a STRING-declared formula gets STRING's default menu.
          for (const rule of parsedAggregations) {
            const field = calculated.get(rule.column);
            if (!field) continue;
            const level = calculatedFieldLevelOf(field, metricSchemaFields);
            if (!isAggregateLevel(level)) continue;
            errors.push({
              code: 'AGGREGATION_ON_CALCULATED_METRIC',
              column: rule.column,
              level,
              message: `\`${rule.column}\` is a calculated field and is already aggregated.`,
            });
          }

          // NOT "a selected column with no aggregation of its own is a group-by key, therefore a
          // metric among them is an error" — that premise is false for a calculated metric. Task 8
          // projects it into SELECT and deliberately excludes it from GROUP BY (it already IS an
          // aggregate, spec §2.3); `compose()`'s `excludeCalculatedMetricNames` keeps it out of the
          // plain `columns` list reaching the query builder regardless of what else is aggregated,
          // so a metric never becomes a dimension by omission. `country` + `SUM(clicks)` + `ctr` is
          // exactly spec §5.2's own worked example and must validate cleanly (pinned below).
          //
          // The one shape where a caller CAN explicitly ask to group BY a metric: a dateTrunc rule
          // naming it. AGGREGATE-LEVEL only, permanently — such a field is not a dimension at all.
          //
          // The row-level arm is GONE (slice 3b, D16). D10 held bucketing back because a
          // mis-declared formula was expected to yield NULL on the coercing dialects — a silently
          // empty column. The probe measured all 26 shapes on five warehouses and NO cell returned
          // NULL: every dialect either truncates correctly or raises. A row-level formula is a
          // dimension, so it is now bucketed exactly as a warehouse column of its declared type is,
          // which means the generic type check below is the one that answers — a STRING-declared
          // formula is refused in the same words a STRING column is. Nothing is CAST on the way
          // there: the probe measured `CAST(<expr> AS DATE)` turning a loud Redshift refusal into
          // `2026-05-01` for a value meaning the 5th of August, so a cast trades an error for a
          // wrong month (§1.2).
          for (const rule of parsedDateTruncs) {
            const field = calculated.get(rule.column);
            if (!field) continue;
            const level = calculatedFieldLevelOf(field, metricSchemaFields);
            if (!isAggregateLevel(level)) continue;
            errors.push({
              code: 'CALCULATED_METRIC_AS_DIMENSION',
              column: rule.column,
              level,
              message: `\`${rule.column}\` is a calculated field and cannot be used as a dimension.`,
            });
          }

          // A broken formula reference fails the query explicitly rather than returning NULL
          // (spec §7) — see `brokenReferencesOf` for why this is not redundant with save-time
          // validation. Only checked for a metric this composition actually USES (selects,
          // filters, or sorts by): an unrelated broken metric elsewhere in the schema is not this
          // report's problem.
          const usedNames = new Set<string>([
            ...(args.columnConfig ?? []),
            ...parsedFilters.map(rule => rule.column),
            ...parsedSort.map(rule => rule.column),
          ]);
          // A joined reference that no longer resolves is broken for a sharper reason than an own
          // one: nothing routes it to a sleeve, so `renderAggregatedSelect` qualifies the joined
          // mart's column name against `main` — an unrecognised name when main has no such column,
          // and a plausible WRONG NUMBER when it happens to have one. Same channel, same message.
          const joinedReferenceIndex = buildJoinedReferenceIndex(blendableSchema);
          for (const [name, field] of calculated) {
            if (!usedNames.has(name)) continue;
            const missing = [
              ...brokenReferencesOf(field, metricSchemaFields),
              ...brokenJoinedReferencesOf(field, joinedReferenceIndex),
            ];
            if (missing.length > 0) {
              // NOT "gone from the Data Mart" any more (#6732): `brokenReferencesOf` is transitive,
              // so what it reports can be a column another formula in the chain reads — or the name
              // of a calculated field that is right there in the schema and simply cannot be
              // computed, because ITS own formula is unparseable. Both are unusable; only one of
              // them is gone, and telling an analyst to restore a field they can see sends them
              // after the wrong repair.
              errors.push({
                code: 'CALCULATED_METRIC_BROKEN_REFERENCES',
                column: name,
                message:
                  `\`${name}\` cannot be computed: it reads ` +
                  `${missing.map(m => `\`${m}\``).join(', ')}, ` +
                  `which ${missing.length === 1 ? 'is' : 'are'} missing from the Data Mart, or ` +
                  `broken.`,
              });
            }
          }

          // Filtering BY a calculated field used to be refused here, at both levels. It is not any
          // more (#6732 spec §1.1): the published reason described an ALIAS, and a predicate's
          // left-hand side is already an opaque SQL string — the rule's LHS is the field's own
          // formula, measured compiling identically on all five storages. What remains of the
          // refusal is D22's narrow case, raised ABOVE this branch so a non-actualized schema
          // cannot skip it, and the ordinary type check the rule now reaches like any column's.
        }

        // A JOINED Data Mart's calculated field is refused on every surface that can name one.
        // Deliberately outside the `calculated.size > 0` block above: those guards are keyed on
        // the MAIN mart's own fields, and a joined mart's formula is refused whether or not this
        // Data Mart owns one of its own. The projection is checked here only opportunistically —
        // this branch runs only where `needsSchema` already paid for a blendable schema, so a
        // report that merely projects (with or without a `limit`, which is an output control but
        // not a reason to resolve a schema) never reaches it. `BlendedReportDataService` refuses
        // the projection unconditionally on the compose path, where it always holds one.
        const joinedCalculatedRefusals = joinedCalculatedFieldRefusals(
          blendableSchema.blendedFields,
          [
            ...(args.columnConfig ?? []),
            ...parsedFilters.map(rule => rule.column),
            ...parsedSort.map(rule => rule.column),
            ...parsedAggregations.map(rule => rule.column),
            ...parsedDateTruncs.map(rule => rule.column),
          ],
          new Set(connectedNativeNames)
        );
        const joinedCalculatedColumns = new Set(joinedCalculatedRefusals.map(r => r.column));
        for (const refusal of joinedCalculatedRefusals) {
          errors.push({ code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED', ...refusal });
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
        // A rule on a calculated field is NO LONGER dropped wholesale (#6732): it is checked
        // against its DECLARED type like any column's, in whichever clause its LEVEL puts it —
        // which is why these rules are the ROUTED ones, so `validateFilters` and
        // `validateHavingFilters` read the clause off the rule rather than off `rule.function`.
        // Only the ones already refused above are dropped, for the reason a dropped rule always
        // is: a second verdict — an operator complaint against the declared type, a missing
        // aggregation — would send the caller after a repair that fixes nothing.
        // A joined Data Mart's calculated field is dropped on the same grounds.
        const filtersToValidate = routedFilters.filter(
          rule =>
            !isUniqueCountColumn(rule.column) &&
            !refusedCalculatedFilterColumns.has(rule.column) &&
            !joinedCalculatedColumns.has(rule.column)
        );

        for (const rule of parsedAggregations.filter(r => isUniqueCountColumn(r.column))) {
          errors.push({
            code: 'UNIQUE_COUNT_AGGREGATION_UNSUPPORTED',
            column: rule.column,
            message: `"${rule.column}" is a Unique Count metric — already an aggregate, so it cannot be aggregated again. Remove the aggregation on it.`,
          });
        }
        const aggregationsToValidate = parsedAggregations.filter(
          rule => !isUniqueCountColumn(rule.column) && !joinedCalculatedColumns.has(rule.column)
        );

        for (const rule of parsedDateTruncs.filter(r => isUniqueCountColumn(r.column))) {
          errors.push({
            code: 'UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED',
            column: rule.column,
            message: `"${rule.column}" is a Unique Count metric, not a date column, so it cannot be bucketed. Remove the date bucket on it.`,
          });
        }
        // A rule on the mart's OWN calculated field is deliberately NOT dropped here the way a
        // filter rule is (#6732 slice 3b): since the row-level refusal above went away, this
        // generic check is the ONLY verdict a row-level field's bucket gets — and the right one,
        // because a STRING-declared formula is refused for the same reason, and in the same words,
        // as a STRING column.
        const dateTruncsToValidate = parsedDateTruncs.filter(
          rule => !isUniqueCountColumn(rule.column) && !joinedCalculatedColumns.has(rule.column)
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
          //
          // MINUS every calculated field (decision 10): it has no warehouse column, so `SELECT *`
          // cannot project it and it is composed only when named. `connectedNativeNames` carries
          // it — `isConnected` answers true for a formula — so without this subtraction a sort on
          // a metric counted as selected, saved without a word, and then emitted
          // `SELECT * … ORDER BY src.ctr` on every run. Resolved through the one function that
          // already answers "what does an implicit-all selection contain", rather than a second
          // spelling of the same rule.
          const selectedSet = new Set(
            args.columnConfig ?? implicitAllNativeColumnNames(blendableSchema)
          );
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
          errors.push(
            ...this.validateSort(
              parsedSort.filter(rule => !joinedCalculatedColumns.has(rule.column)),
              selectedSet
            )
          );
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
              aggregatedColumns,
              new Set(calculated.keys())
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

        // The projected output column names (dimensions + aggregated labels +
        // Unique Count, main and per joined source) must be unique — a collision is a duplicate
        // alias on BigQuery / a silent clobber on name-keyed readers.
        // Mirror resolveReportDataHeaders: a metrics-only report (aggregations /
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
