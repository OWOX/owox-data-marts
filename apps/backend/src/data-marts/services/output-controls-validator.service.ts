import { Injectable, BadRequestException } from '@nestjs/common';
import { FilterConfig, FilterConfigSchema, FilterRule } from '../dto/schemas/filter-config.schema';
import { SortConfig, SortConfigSchema, SortRule } from '../dto/schemas/sort-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { BlendableSchemaService } from './blendable-schema.service';

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
  | { code: 'FILTER_ALIAS_PATH_UNKNOWN'; aliasPath: string }
  | { code: 'FILTER_ALIAS_PATH_NOT_INCLUDED'; aliasPath: string }
  | { code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' };

const STRING_TYPES = new Set(['STRING']);
const NUMBER_TYPES = new Set(['INTEGER', 'FLOAT', 'NUMERIC', 'BIGNUMERIC']);
const DATE_TYPES = new Set(['DATE', 'DATETIME', 'TIMESTAMP', 'TIME']);
const BOOL_TYPES = new Set(['BOOLEAN']);

// `is_empty`/`is_not_empty` are STRING-only — on non-STRING they used to render
// as `col = ''` which BigQuery rejects for TIMESTAMP/DATE/INTEGER/FLOAT.
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
  return false;
}

@Injectable()
export class OutputControlsValidatorService {
  constructor(
    private readonly capabilityService: OutputControlsCapabilityService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  /**
   * Validates a list of filter rules against the blendable schema.
   *
   * - post-join rules (`placement === 'post-join'` or omitted): looked up in
   *   `homeFieldTypes` (blended output aliases + home native fields).
   * - pre-join rules (`placement === 'pre-join'`): looked up by `aliasPath` in
   *   `knownPaths`, then by raw column name inside that path. Pre-join rules
   *   targeting excluded sources or the home mart are rejected with dedicated
   *   error codes so the FE can surface the right message.
   */
  validateFilters(
    filters: FilterRule[],
    homeFieldTypes: Map<string, string>,
    knownPaths?: ReadonlyMap<string, ReadonlyMap<string, string>>,
    excludedPaths?: ReadonlySet<string>
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const rule of filters) {
      if (rule.placement === 'pre-join') {
        const aliasPath = rule.aliasPath!;
        if (excludedPaths?.has(aliasPath)) {
          errors.push({ code: 'FILTER_ALIAS_PATH_NOT_INCLUDED', aliasPath });
          continue;
        }
        const subsidiaryTypes = knownPaths?.get(aliasPath);
        if (!subsidiaryTypes) {
          errors.push({ code: 'FILTER_ALIAS_PATH_UNKNOWN', aliasPath });
          continue;
        }
        const type = subsidiaryTypes.get(rule.column);
        if (type === undefined) {
          errors.push({ code: 'FILTER_COLUMN_UNKNOWN', column: rule.column, aliasPath });
          continue;
        }
        this.validateRuleAgainstType(rule, type, aliasPath, errors);
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
        args.projectId
      );

      const homeFieldTypes = new Map<string, string>();
      for (const native of blendableSchema.nativeFields) {
        homeFieldTypes.set(native.name, native.type);
      }
      for (const blended of blendableSchema.blendedFields) {
        homeFieldTypes.set(blended.name, blended.type);
      }

      if (parsedFilters.length > 0) {
        const { knownPaths, excludedPaths } = this.buildKnownPaths(blendableSchema);
        errors.push(
          ...this.validateFilters(parsedFilters, homeFieldTypes, knownPaths, excludedPaths)
        );
      }
      if (parsedSort.length > 0) {
        const selectedSet = new Set(args.columnConfig ?? Array.from(homeFieldTypes.keys()));
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

  private buildKnownPaths(blendableSchema: {
    availableSources: { aliasPath: string; isIncluded?: boolean }[];
    blendedFields: { aliasPath: string; originalFieldName: string; type: string }[];
  }): { knownPaths: Map<string, Map<string, string>>; excludedPaths: Set<string> } {
    const knownPaths = new Map<string, Map<string, string>>();
    const excludedPaths = new Set<string>();
    for (const source of blendableSchema.availableSources) {
      if (source.isIncluded === false) {
        excludedPaths.add(source.aliasPath);
        continue;
      }
      if (!knownPaths.has(source.aliasPath)) {
        knownPaths.set(source.aliasPath, new Map());
      }
    }
    for (const field of blendableSchema.blendedFields) {
      if (excludedPaths.has(field.aliasPath)) continue;
      let fields = knownPaths.get(field.aliasPath);
      if (!fields) {
        fields = new Map();
        knownPaths.set(field.aliasPath, fields);
      }
      fields.set(field.originalFieldName, field.type);
    }
    return { knownPaths, excludedPaths };
  }
}
