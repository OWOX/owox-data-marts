import { DataMartSchema, DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataQualityCanonicalType,
  normalizeDataQualityType,
} from '../data-quality/data-quality-sql-dialect';
import {
  DEFAULT_DATA_QUALITY_TIMEZONE,
  DataQualityCheckScope,
  DataQualityConfig,
  DataQualityConfigSchema,
  EffectiveDataQualityConfig,
  EffectiveDataQualityConfigSchema,
  EffectiveDataQualityRuleConfig,
  buildDataQualityRuleKey,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';

const TABLE_CATEGORIES = [
  DataQualityCategory.PK_UNIQUENESS,
  DataQualityCategory.DUPLICATE_ROWS,
  DataQualityCategory.EMPTY_TABLE,
  DataQualityCategory.DATA_FRESHNESS,
] as const;

const FIELD_CATEGORIES = [
  DataQualityCategory.NULL_RATE,
  DataQualityCategory.COLUMN_UNIQUENESS,
  DataQualityCategory.CONSTANT_COLUMN,
  DataQualityCategory.TYPE_MISMATCH,
  DataQualityCategory.DATA_FRESHNESS,
  DataQualityCategory.FUTURE_VALUES,
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
  [DataQualityCategory.FUTURE_VALUES]: DataQualitySeverity.WARNING,
  [DataQualityCategory.NEGATIVE_VALUES]: DataQualitySeverity.WARNING,
  [DataQualityCategory.RELATIONSHIP_INTEGRITY]: DataQualitySeverity.WARNING,
  [DataQualityCategory.REVERSE_RELATIONSHIP]: DataQualitySeverity.NOTICE,
};

interface CurrentField {
  id: string;
  isPrimaryKey: boolean;
  type: string;
  requiresFlattening: boolean;
}

const NESTED_COLLECTION_FIELD_REASON =
  'Nested field is inside a repeated, array, map, or semi-structured container and requires provider-specific flattening';

export function resolveEffectiveDataQualityConfig(
  savedConfig: DataQualityConfig | null | undefined,
  schema: DataMartSchema | null | undefined,
  relationships: readonly DataQualityRelationshipSnapshot[],
  definitionType: DataMartDefinitionType | null | undefined
): EffectiveDataQualityConfig {
  const systemPreset = deriveSystemPreset(schema, relationships, definitionType);
  if (savedConfig === null || savedConfig === undefined) {
    return systemPreset;
  }

  const parsedSavedConfig = DataQualityConfigSchema.parse(savedConfig);
  const discoveredByKey = new Map(systemPreset.rules.map(rule => [rule.key, rule]));
  const savedByKey = new Map(parsedSavedConfig.rules.map(rule => [rule.key, rule]));
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
      notApplicableReason: staleScopeReason(savedRule.scope),
    });
  }

  return EffectiveDataQualityConfigSchema.parse({
    timezone: parsedSavedConfig.timezone,
    rules: sortRules(effectiveRules),
  });
}

function deriveSystemPreset(
  schema: DataMartSchema | null | undefined,
  relationships: readonly DataQualityRelationshipSnapshot[],
  definitionType: DataMartDefinitionType | null | undefined
): EffectiveDataQualityConfig {
  const fields = collectCurrentFields(schema?.fields ?? []);
  const primaryKeyFields = fields.filter(field => field.isPrimaryKey);
  const primaryKeyIds = new Set(primaryKeyFields.map(field => field.id));
  const hasUnsafePrimaryKey = primaryKeyFields.some(field => field.requiresFlattening);
  const fieldIds = new Set(fields.map(field => field.id));
  const fieldsRequiringFlattening = new Set(
    fields.filter(field => field.requiresFlattening).map(field => field.id)
  );
  const relationshipJoinFieldIds = new Set(
    relationships.flatMap(relationship =>
      relationship.joinConditions.map(condition => condition.sourceFieldName)
    )
  );
  const rules: EffectiveDataQualityRuleConfig[] = [];

  for (const category of TABLE_CATEGORIES) {
    const scope: DataQualityCheckScope = { type: DataQualityScope.DATA_MART };
    const hasPrimaryKey = primaryKeyIds.size > 0;
    const freshnessApplicability = getDataMartFreshnessApplicability(category, definitionType);
    const isApplicable =
      (category !== DataQualityCategory.PK_UNIQUENESS || (hasPrimaryKey && !hasUnsafePrimaryKey)) &&
      freshnessApplicability.isApplicable;
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
              : freshnessApplicability.reason,
      })
    );
  }

  for (const field of fields) {
    for (const category of FIELD_CATEGORIES) {
      const scope: DataQualityCheckScope = {
        type: DataQualityScope.FIELD,
        fieldId: field.id,
      };
      const isPrimaryKeyNullRate =
        category === DataQualityCategory.NULL_RATE && primaryKeyIds.has(field.id);
      const isRelationshipNullRate =
        category === DataQualityCategory.NULL_RATE && relationshipJoinFieldIds.has(field.id);
      const applicability = getFieldApplicability(category, field, schema, definitionType);
      rules.push(
        createRule(category, scope, {
          enabled: applicability.isApplicable && (isPrimaryKeyNullRate || isRelationshipNullRate),
          severity: isPrimaryKeyNullRate
            ? DataQualitySeverity.ERROR
            : CATEGORY_DEFAULT_SEVERITY[category],
          isApplicable: applicability.isApplicable,
          notApplicableReason: applicability.reason,
          parameters:
            category === DataQualityCategory.NULL_RATE
              ? { thresholdPercent: 0 }
              : category === DataQualityCategory.DATA_FRESHNESS
                ? { thresholdHours: 24 }
                : {},
        })
      );
    }
  }

  const uniqueRelationships = [...new Map(relationships.map(item => [item.id, item])).values()];
  for (const relationship of uniqueRelationships) {
    const missingSourceFields = relationship.joinConditions
      .map(condition => condition.sourceFieldName)
      .filter(fieldId => !fieldIds.has(fieldId));
    const unsafeSourceFields = relationship.joinConditions
      .map(condition => condition.sourceFieldName)
      .filter(fieldId => fieldsRequiringFlattening.has(fieldId));
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
    timezone: DEFAULT_DATA_QUALITY_TIMEZONE,
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
  prefix = '',
  ancestorRequiresFlattening = false
): CurrentField[] {
  const result: CurrentField[] = [];
  for (const field of fields) {
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const id = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({
      id,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      type: String(field.type),
      requiresFlattening: ancestorRequiresFlattening,
    });
    if ('fields' in field && field.fields?.length) {
      result.push(
        ...collectCurrentFields(
          field.fields,
          id,
          ancestorRequiresFlattening || descendantsRequireFlattening(field)
        )
      );
    }
  }
  return result;
}

function getFieldApplicability(
  category: DataQualityCategory,
  field: CurrentField,
  schema: DataMartSchema | null | undefined,
  definitionType: DataMartDefinitionType | null | undefined
): { isApplicable: boolean; reason?: string } {
  if (field.requiresFlattening) {
    return { isApplicable: false, reason: NESTED_COLLECTION_FIELD_REASON };
  }

  if (category === DataQualityCategory.DATA_FRESHNESS) {
    if (isPhysicalDefinition(definitionType)) {
      return {
        isApplicable: false,
        reason: 'Field freshness is not applicable to physical TABLE or CONNECTOR definitions',
      };
    }
    if (!isLogicalDefinition(definitionType)) {
      return {
        isApplicable: false,
        reason: 'Data Mart definition type is required to determine freshness strategy',
      };
    }
  }

  const storageType = storageTypeForSchema(schema);
  const type = storageType ? normalizeDataQualityType(storageType, field.type) : null;
  const dateCompatible =
    type === DataQualityCanonicalType.DATE || type === DataQualityCanonicalType.TIMESTAMP;
  const numeric =
    type === DataQualityCanonicalType.INTEGER ||
    type === DataQualityCanonicalType.FLOAT ||
    type === DataQualityCanonicalType.DECIMAL;

  if (
    (category === DataQualityCategory.DATA_FRESHNESS ||
      category === DataQualityCategory.FUTURE_VALUES) &&
    !dateCompatible
  ) {
    return {
      isApplicable: false,
      reason: `${category} requires a DATE or TIMESTAMP-compatible Output Schema field`,
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

function getDataMartFreshnessApplicability(
  category: DataQualityCategory,
  definitionType: DataMartDefinitionType | null | undefined
): { isApplicable: boolean; reason?: string } {
  if (category !== DataQualityCategory.DATA_FRESHNESS || isPhysicalDefinition(definitionType)) {
    return { isApplicable: true };
  }
  if (isLogicalDefinition(definitionType)) {
    return {
      isApplicable: false,
      reason:
        'Metadata freshness is not applicable to logical SQL, VIEW, or TABLE_PATTERN definitions',
    };
  }
  return {
    isApplicable: false,
    reason: 'Data Mart definition type is required to determine freshness strategy',
  };
}

function isPhysicalDefinition(definitionType: DataMartDefinitionType | null | undefined): boolean {
  return (
    definitionType === DataMartDefinitionType.TABLE ||
    definitionType === DataMartDefinitionType.CONNECTOR
  );
}

function isLogicalDefinition(definitionType: DataMartDefinitionType | null | undefined): boolean {
  return (
    definitionType === DataMartDefinitionType.SQL ||
    definitionType === DataMartDefinitionType.VIEW ||
    definitionType === DataMartDefinitionType.TABLE_PATTERN
  );
}

function storageTypeForSchema(schema: DataMartSchema | null | undefined): DataStorageType | null {
  switch (schema?.type) {
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
    default:
      return null;
  }
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
