import { Injectable, BadRequestException } from '@nestjs/common';
import { FilterConfig, FilterConfigSchema, FilterRule } from '../dto/schemas/filter-config.schema';
import { SortConfig, SortConfigSchema, SortRule } from '../dto/schemas/sort-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { BlendableSchemaService } from './blendable-schema.service';

export type ValidationError =
  | { code: 'FILTER_COLUMN_UNKNOWN'; column: string }
  | { code: 'INVALID_OPERATOR_FOR_TYPE'; column: string; type: string; operator: string }
  | { code: 'INVALID_REGEX_PATTERN'; column: string; pattern: string }
  | { code: 'SORT_COLUMN_NOT_SELECTED'; column: string };

const STRING_TYPES = new Set(['STRING']);
const NUMBER_TYPES = new Set(['INTEGER', 'FLOAT', 'NUMERIC', 'BIGNUMERIC']);
const DATE_TYPES = new Set(['DATE', 'DATETIME', 'TIMESTAMP', 'TIME']);
const BOOL_TYPES = new Set(['BOOLEAN']);

// `is_empty` / `is_not_empty` are kept for STRING only — for non-STRING types
// they previously rendered as `col = ''` / `col != ''`, which BigQuery rejects
// for TIMESTAMP/DATE/INTEGER/FLOAT (cannot cast '' to those types). Non-STRING
// types use the unambiguous `is_null` / `is_not_null` instead.
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
const BOOL_OPS = new Set(['is_true', 'is_false', 'is_null', 'is_not_null']);

function operatorAllowed(fieldType: string, operator: string): boolean {
  if (STRING_TYPES.has(fieldType)) return STRING_OPS.has(operator);
  if (NUMBER_TYPES.has(fieldType)) return NUMBER_OPS.has(operator);
  if (DATE_TYPES.has(fieldType)) return DATE_OPS.has(operator);
  if (BOOL_TYPES.has(fieldType)) return BOOL_OPS.has(operator);
  return false; // any other type — unsupported
}

@Injectable()
export class OutputControlsValidatorService {
  constructor(
    private readonly capabilityService: OutputControlsCapabilityService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  validateFilters(filters: FilterRule[], fieldTypes: Map<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const rule of filters) {
      const type = fieldTypes.get(rule.column);
      if (type === undefined) {
        errors.push({ code: 'FILTER_COLUMN_UNKNOWN', column: rule.column });
        continue;
      }
      if (!operatorAllowed(type, rule.operator)) {
        errors.push({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: rule.column,
          type,
          operator: rule.operator,
        });
        continue;
      }
      if (rule.operator === 'regex' || rule.operator === 'not_regex') {
        const pattern = String(rule.value);
        try {
          new RegExp(pattern);
        } catch {
          errors.push({ code: 'INVALID_REGEX_PATTERN', column: rule.column, pattern });
        }
      }
    }
    return errors;
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

  /**
   * High-level orchestrator: capability + filter + sort validation in one call.
   * Reads the field-type map from BlendableSchemaService. Throws BadRequestException
   * with structured details if anything fails.
   */
  async validateForReport(args: {
    storageType: DataStorageType;
    dataMartId: string;
    projectId: string;
    columnConfig: string[] | null | undefined;
    filterConfig: FilterConfig | null | undefined;
    sortConfig: SortConfig | null | undefined;
    limitConfig: number | null | undefined;
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
    if ((args.filterConfig?.length ?? 0) > 0) {
      const result = FilterConfigSchema.safeParse(args.filterConfig);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Filter config has invalid shape',
          details: { errors: result.error.issues },
        });
      }
      parsedFilters = result.data ?? [];
    }
    if ((args.sortConfig?.length ?? 0) > 0) {
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

    if (parsedFilters.length > 0 || parsedSort.length > 0) {
      const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
        args.dataMartId,
        args.projectId
      );

      const fieldTypes = new Map<string, string>();
      for (const native of blendableSchema.nativeFields) {
        fieldTypes.set(native.name, native.type);
      }
      for (const blended of blendableSchema.blendedFields) {
        fieldTypes.set(blended.name, blended.type);
      }

      if (parsedFilters.length > 0) {
        errors.push(...this.validateFilters(parsedFilters, fieldTypes));
      }
      if (parsedSort.length > 0) {
        const selectedSet = new Set(args.columnConfig ?? Array.from(fieldTypes.keys()));
        errors.push(...this.validateSort(parsedSort, selectedSet));
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors },
      });
    }
  }
}
