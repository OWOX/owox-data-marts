import { DataMartSchema, DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataQualityCanonicalType,
  isDataQualityGroupingTypeSupported,
  normalizeDataQualityType,
} from '../data-quality/data-quality-sql-dialect';
import { isDataQualityFreshnessTypeSupported } from '../data-quality/data-quality-freshness-support';
import {
  DataQualityCheckScope,
  DataQualityConfig,
  DataQualityConfigSchema,
  EffectiveDataQualityConfig,
  EffectiveDataQualityConfigSchema,
  EffectiveDataQualityRuleConfig,
  buildDataQualityRuleKey,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';

const TABLE_CATEGORIES = [
  DataQualityCategory.PK_UNIQUENESS,
  DataQualityCategory.DUPLICATE_ROWS,
  DataQualityCategory.EMPTY_TABLE,
] as const;

const FIELD_CATEGORIES = [
  DataQualityCategory.NULL_RATE,
  DataQualityCategory.COLUMN_UNIQUENESS,
  DataQualityCategory.CONSTANT_COLUMN,
  DataQualityCategory.TYPE_MISMATCH,
  DataQualityCategory.NEGATIVE_VALUES,
] as const;

const RELATIONSHIP_CATEGORIES = [
  DataQualityCategory.RELATIONSHIP_INTEGRITY,
  DataQualityCategory.REVERSE_RELATIONSHIP,
] as const;

const CATEGORY_DEFAULT_SEVERITY: Readonly<Record<DataQualityCategory, DataQualitySeverity>> = {
  [DataQualityCategory.EMPTY_TABLE]: DataQualitySeverity.ERROR,
  [DataQualityCategory.PK_UNIQUENESS]: DataQualitySeverity.ERROR,
  [DataQualityCategory.DUPLICATE_ROWS]: DataQualitySeverity.ERROR,
  [DataQualityCategory.NULL_RATE]: DataQualitySeverity.WARNING,
  [DataQualityCategory.COLUMN_UNIQUENESS]: DataQualitySeverity.ERROR,
  [DataQualityCategory.CONSTANT_COLUMN]: DataQualitySeverity.NOTICE,
  [DataQualityCategory.TYPE_MISMATCH]: DataQualitySeverity.ERROR,
  [DataQualityCategory.DATA_FRESHNESS]: DataQualitySeverity.WARNING,
  [DataQualityCategory.NEGATIVE_VALUES]: DataQualitySeverity.WARNING,
  [DataQualityCategory.RELATIONSHIP_INTEGRITY]: DataQualitySeverity.WARNING,
  [DataQualityCategory.REVERSE_RELATIONSHIP]: DataQualitySeverity.NOTICE,
};

interface CurrentField {
  path: string[];
  isPrimaryKey: boolean;
  type: string;
  mode?: string;
  requiresFlattening: boolean;
  typeIntrospectionRequiresFlattening: boolean;
  isTopLevel: boolean;
}

const NESTED_COLLECTION_FIELD_REASON =
  'Nested field is inside a repeated, array, map, or semi-structured container and requires provider-specific flattening';

export function resolveEffectiveDataQualityConfig(
  savedConfig: DataQualityConfig | null | undefined,
  schema: DataMartSchema | null | undefined,
  relationships: readonly DataQualityRelationshipSnapshot[]
): EffectiveDataQualityConfig {
  const systemPreset = deriveSystemPreset(schema, relationships);
  if (savedConfig === null || savedConfig === undefined) {
    return systemPreset;
  }

  const parsedSavedConfig = DataQualityConfigSchema.parse(savedConfig);
  const discoveredByKey = new Map(systemPreset.rules.map(rule => [rule.key, rule]));
  const savedByKey = new Map(parsedSavedConfig.rules.map(rule => [rule.key, rule]));
  const currentFieldPaths = new Set(
    collectCurrentFields(schema?.fields ?? []).map(field => fieldPathKey(field.path))
  );
  const effectiveRules = systemPreset.rules.map(discoveredRule => {
    const savedRule = savedByKey.get(discoveredRule.key);
    if (!savedRule) {
      return { ...discoveredRule, enabled: false };
    }
    return {
      ...savedRule,
      isApplicable: discoveredRule.isApplicable,
      notApplicableReason: discoveredRule.notApplicableReason,
    };
  });

  for (const savedRule of parsedSavedConfig.rules) {
    if (discoveredByKey.has(savedRule.key)) continue;
    effectiveRules.push({
      ...savedRule,
      isApplicable: false,
      notApplicableReason:
        savedRule.category === DataQualityCategory.DATA_FRESHNESS &&
        savedRule.scope.type === DataQualityScope.FIELD &&
        currentFieldPaths.has(fieldPathKey(savedRule.scope.fieldPath))
          ? 'Field is no longer eligible for Data Freshness'
          : staleScopeReason(savedRule.scope),
    });
  }

  return EffectiveDataQualityConfigSchema.parse({
    rules: sortRules(effectiveRules),
  });
}

function deriveSystemPreset(
  schema: DataMartSchema | null | undefined,
  relationships: readonly DataQualityRelationshipSnapshot[]
): EffectiveDataQualityConfig {
  const fields = collectCurrentFields(schema?.fields ?? []);
  const storageType = storageTypeForSchema(schema);
  const primaryKeyFields = fields.filter(field => field.isPrimaryKey);
  const primaryKeyPaths = new Set(primaryKeyFields.map(field => fieldPathKey(field.path)));
  const hasUnsafePrimaryKey = primaryKeyFields.some(field => field.requiresFlattening);
  const fieldPaths = new Set(fields.map(field => fieldPathKey(field.path)));
  const fieldsRequiringFlattening = new Set(
    fields.filter(field => field.requiresFlattening).map(field => fieldPathKey(field.path))
  );
  const relationshipJoinFieldIds = new Set(
    relationships.flatMap(relationship =>
      relationship.joinConditions.map(condition => fieldPathKey([condition.sourceFieldName]))
    )
  );
  const rules: EffectiveDataQualityRuleConfig[] = [];
  const topLevelFields = fields.filter(field => field.isTopLevel);
  const unsupportedDuplicateField = topLevelFields.find(
    field =>
      !isDataQualityGroupingTypeSupported(
        storageType ? normalizeCurrentFieldType(storageType, field) : null
      )
  );

  for (const category of TABLE_CATEGORIES) {
    const scope: DataQualityCheckScope = { type: DataQualityScope.DATA_MART };
    const hasPrimaryKey = primaryKeyPaths.size > 0;
    const duplicateRowsApplicable =
      category !== DataQualityCategory.DUPLICATE_ROWS ||
      (topLevelFields.length > 0 && unsupportedDuplicateField === undefined);
    const isApplicable =
      (category !== DataQualityCategory.PK_UNIQUENESS || (hasPrimaryKey && !hasUnsafePrimaryKey)) &&
      duplicateRowsApplicable;
    rules.push(
      createRule(category, scope, {
        enabled:
          category === DataQualityCategory.EMPTY_TABLE ||
          (category === DataQualityCategory.PK_UNIQUENESS && hasPrimaryKey),
        severity: CATEGORY_DEFAULT_SEVERITY[category],
        isApplicable,
        notApplicableReason:
          category === DataQualityCategory.PK_UNIQUENESS && !hasPrimaryKey
            ? 'No primary key fields are configured in the current Output Schema'
            : category === DataQualityCategory.PK_UNIQUENESS && hasUnsafePrimaryKey
              ? NESTED_COLLECTION_FIELD_REASON
              : category === DataQualityCategory.DUPLICATE_ROWS && topLevelFields.length === 0
                ? 'No connected materialized Output Schema fields are available'
                : category === DataQualityCategory.DUPLICATE_ROWS && unsupportedDuplicateField
                  ? `Field ${displayFieldPath(unsupportedDuplicateField.path)} cannot be canonicalized for duplicate comparison`
                  : undefined,
      })
    );
  }

  for (const field of fields) {
    for (const category of FIELD_CATEGORIES) {
      const scope: DataQualityCheckScope = {
        type: DataQualityScope.FIELD,
        fieldPath: field.path,
      };
      const isPrimaryKeyNullRate =
        category === DataQualityCategory.NULL_RATE && primaryKeyPaths.has(fieldPathKey(field.path));
      const isRelationshipNullRate =
        category === DataQualityCategory.NULL_RATE &&
        relationshipJoinFieldIds.has(fieldPathKey(field.path));
      const applicability = getFieldApplicability(category, field, schema);
      rules.push(
        createRule(category, scope, {
          enabled: applicability.isApplicable && (isPrimaryKeyNullRate || isRelationshipNullRate),
          severity: isPrimaryKeyNullRate
            ? DataQualitySeverity.ERROR
            : CATEGORY_DEFAULT_SEVERITY[category],
          isApplicable: applicability.isApplicable,
          notApplicableReason: applicability.reason,
          parameters: category === DataQualityCategory.NULL_RATE ? { thresholdPercent: 0 } : {},
        })
      );
    }

    if (
      storageType &&
      !field.requiresFlattening &&
      isDataQualityFreshnessTypeSupported(storageType, field.type)
    ) {
      const scope: DataQualityCheckScope = {
        type: DataQualityScope.FIELD,
        fieldPath: field.path,
      };
      rules.push(
        createRule(DataQualityCategory.DATA_FRESHNESS, scope, {
          enabled: false,
          severity: CATEGORY_DEFAULT_SEVERITY[DataQualityCategory.DATA_FRESHNESS],
          isApplicable: true,
          parameters: { thresholdHours: 24 },
        })
      );
    }
  }

  const uniqueRelationships = [...new Map(relationships.map(item => [item.id, item])).values()];
  for (const relationship of uniqueRelationships) {
    const missingSourceFields = relationship.joinConditions
      .map(condition => condition.sourceFieldName)
      .filter(fieldName => !fieldPaths.has(fieldPathKey([fieldName])));
    const unsafeSourceFields = relationship.joinConditions
      .map(condition => condition.sourceFieldName)
      .filter(fieldName => fieldsRequiringFlattening.has(fieldPathKey([fieldName])));
    const targetAccessible = relationship.targetAccessible !== false;
    const structurallyApplicable =
      relationship.joinConditions.length > 0 && missingSourceFields.length === 0;
    const isApplicable =
      targetAccessible && structurallyApplicable && unsafeSourceFields.length === 0;
    const notApplicableReason = isApplicable
      ? undefined
      : !targetAccessible
        ? 'Relationship target Data Mart is not accessible'
        : missingSourceFields.length > 0
          ? `Relationship source fields are missing from the current Output Schema: ${missingSourceFields.join(', ')}`
          : relationship.joinConditions.length === 0
            ? 'Relationship has no join conditions'
            : NESTED_COLLECTION_FIELD_REASON;

    for (const category of RELATIONSHIP_CATEGORIES) {
      const scope: DataQualityCheckScope = {
        type: DataQualityScope.RELATIONSHIP,
        relationshipId: relationship.id,
      };
      rules.push(
        createRule(category, scope, {
          enabled:
            category === DataQualityCategory.RELATIONSHIP_INTEGRITY && structurallyApplicable,
          severity: CATEGORY_DEFAULT_SEVERITY[category],
          isApplicable,
          notApplicableReason,
        })
      );
    }
  }

  return EffectiveDataQualityConfigSchema.parse({
    rules: sortRules(rules),
  });
}

function createRule(
  category: DataQualityCategory,
  scope: DataQualityCheckScope,
  overrides: Partial<
    Pick<
      EffectiveDataQualityRuleConfig,
      'enabled' | 'severity' | 'isApplicable' | 'notApplicableReason' | 'parameters'
    >
  > = {}
): EffectiveDataQualityRuleConfig {
  return {
    key: buildDataQualityRuleKey(category, scope),
    category,
    scope,
    severity: overrides.severity ?? CATEGORY_DEFAULT_SEVERITY[category],
    enabled: overrides.enabled ?? false,
    isApplicable: overrides.isApplicable ?? true,
    ...(overrides.notApplicableReason
      ? { notApplicableReason: overrides.notApplicableReason }
      : {}),
    parameters:
      overrides.parameters ??
      (category === DataQualityCategory.DATA_FRESHNESS ? { thresholdHours: 24 } : {}),
  };
}

function collectCurrentFields(
  fields: readonly DataMartSchemaField[],
  prefix: readonly string[] = [],
  ancestorRequiresFlattening = false,
  isTopLevel = true
): CurrentField[] {
  const result: CurrentField[] = [];
  for (const field of fields) {
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const path = [...prefix, field.name];
    const mode = 'mode' in field && typeof field.mode === 'string' ? field.mode : undefined;
    result.push({
      path,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      type: String(field.type),
      mode,
      requiresFlattening: ancestorRequiresFlattening || isRepeatedScalar(field),
      typeIntrospectionRequiresFlattening: ancestorRequiresFlattening,
      isTopLevel,
    });
    if ('fields' in field && field.fields?.length) {
      result.push(
        ...collectCurrentFields(
          field.fields,
          path,
          ancestorRequiresFlattening || descendantsRequireFlattening(field),
          false
        )
      );
    }
  }
  return result;
}

function getFieldApplicability(
  category: DataQualityCategory,
  field: CurrentField,
  schema: DataMartSchema | null | undefined
): { isApplicable: boolean; reason?: string } {
  if (
    field.requiresFlattening &&
    (category !== DataQualityCategory.TYPE_MISMATCH || field.typeIntrospectionRequiresFlattening)
  ) {
    return { isApplicable: false, reason: NESTED_COLLECTION_FIELD_REASON };
  }

  const storageType = storageTypeForSchema(schema);
  const type = storageType ? normalizeCurrentFieldType(storageType, field) : null;
  const numeric =
    type === DataQualityCanonicalType.INTEGER ||
    type === DataQualityCanonicalType.FLOAT ||
    type === DataQualityCanonicalType.DECIMAL;
  const groupingCompatible = isDataQualityGroupingTypeSupported(type);

  if (
    (category === DataQualityCategory.COLUMN_UNIQUENESS ||
      category === DataQualityCategory.CONSTANT_COLUMN) &&
    !groupingCompatible
  ) {
    return {
      isApplicable: false,
      reason: `${category} requires an Output Schema field that can be canonicalized for grouping`,
    };
  }

  if (category === DataQualityCategory.NEGATIVE_VALUES && !numeric) {
    return {
      isApplicable: false,
      reason: 'negative_values requires a numeric Output Schema field',
    };
  }
  return { isApplicable: true };
}

function descendantsRequireFlattening(field: DataMartSchemaField): boolean {
  const mode = 'mode' in field && typeof field.mode === 'string' ? field.mode.toUpperCase() : '';
  const type = String(field.type).trim().toUpperCase();
  return mode === 'REPEATED' || type === 'VARIANT' || /^(?:ARRAY|MAP)(?:$|[<(])/.test(type);
}

function isRepeatedScalar(field: DataMartSchemaField): boolean {
  const mode = 'mode' in field && typeof field.mode === 'string' ? field.mode.toUpperCase() : '';
  return mode === 'REPEATED' && !('fields' in field && field.fields?.length);
}

function normalizeCurrentFieldType(
  storageType: DataStorageType,
  field: Pick<CurrentField, 'type' | 'mode'>
): DataQualityCanonicalType | null {
  if (
    (storageType === DataStorageType.GOOGLE_BIGQUERY ||
      storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY) &&
    field.mode?.toUpperCase() === 'REPEATED'
  ) {
    return DataQualityCanonicalType.COMPLEX;
  }
  return normalizeDataQualityType(storageType, field.type);
}

function fieldPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function displayFieldPath(path: readonly string[]): string {
  return path.join('.');
}

function storageTypeForSchema(schema: DataMartSchema | null | undefined): DataStorageType | null {
  if (!schema) return null;

  switch (schema.type) {
    case 'bigquery-data-mart-schema':
      return DataStorageType.GOOGLE_BIGQUERY;
    case 'athena-data-mart-schema':
      return DataStorageType.AWS_ATHENA;
    case 'snowflake-data-mart-schema':
      return DataStorageType.SNOWFLAKE;
    case 'redshift-data-mart-schema':
      return DataStorageType.AWS_REDSHIFT;
    case 'databricks-data-mart-schema':
      return DataStorageType.DATABRICKS;
  }

  return assertUnreachableSchema(schema);
}

function assertUnreachableSchema(schema: never): never {
  const type = (schema as { type?: unknown }).type;
  throw new Error(`Unsupported Data Mart schema type: ${String(type)}`);
}

function staleScopeReason(scope: DataQualityCheckScope): string {
  switch (scope.type) {
    case DataQualityScope.DATA_MART:
      return 'Data Mart scope is no longer applicable';
    case DataQualityScope.FIELD:
      return 'Field scope no longer exists in the current Output Schema';
    case DataQualityScope.RELATIONSHIP:
      return 'Relationship scope no longer exists';
  }
}

function sortRules(rules: EffectiveDataQualityRuleConfig[]): EffectiveDataQualityRuleConfig[] {
  return [...rules].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0
  );
}
