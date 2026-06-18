import { Injectable, BadRequestException } from '@nestjs/common';
import { FilterConfig, FilterConfigSchema, FilterRule } from '../dto/schemas/filter-config.schema';
import { SortConfig, SortConfigSchema, SortRule } from '../dto/schemas/sort-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { BlendableSchemaAccessor, BlendableSchemaService } from './blendable-schema.service';
import { throwDisconnectedReportColumnsError } from '../errors/disconnected-report-columns.error';
import { collectSchemaFieldPathTypes } from '../data-storage-types/data-mart-schema.utils';
import { buildBlendedFieldIndex } from './blended-field-index';
import { BlendedFieldEntry } from '../data-storage-types/interfaces/blended-query-builder.interface';

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
  | { code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' };

const STRING_TYPES = new Set(['STRING', 'VARCHAR', 'CHAR', 'TEXT', 'BPCHAR']);
const NUMBER_TYPES = new Set([
  'INTEGER',
  'INT',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'FLOAT',
  'REAL',
  'DOUBLE',
  'DOUBLE PRECISION',
  'NUMERIC',
  'BIGNUMERIC',
  'DECIMAL',
]);
const DATE_TYPES = new Set([
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'TIMESTAMPTZ',
  'TIMESTAMP_NTZ',
]);
// Time-of-day types are kept separate from DATE/TIMESTAMP: relative_date renders
// `current_date` / `date_add(..., current_date)` predicates that are meaningless
// (and rejected by Trino) for a column with no date component.
const TIME_TYPES = new Set(['TIME', 'TIME WITH TIME ZONE', 'TIMETZ']);
const BOOL_TYPES = new Set(['BOOLEAN', 'BOOL']);

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

  async validateForReport(args: {
    storageType: DataStorageType;
    dataMartId: string;
    projectId: string;
    columnConfig: string[] | null | undefined;
    filterConfig: FilterConfig | null | undefined;
    sortConfig: SortConfig | null | undefined;
    limitConfig: number | null | undefined;
    accessor: BlendableSchemaAccessor;
  }): Promise<void> {
    const hasOutputControls =
      (args.filterConfig?.length ?? 0) > 0 ||
      (args.sortConfig?.length ?? 0) > 0 ||
      args.limitConfig != null;
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

    const errors: ValidationError[] = [];

    const hasColumnConfig = (args.columnConfig?.length ?? 0) > 0;
    if (!hasColumnConfig && parsedFilters.some(r => r.placement === 'pre-join')) {
      errors.push({ code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' });
    }

    const needsSchema = parsedFilters.length > 0 || parsedSort.length > 0;
    if (needsSchema) {
      const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
        args.dataMartId,
        args.projectId,
        args.accessor
      );

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
