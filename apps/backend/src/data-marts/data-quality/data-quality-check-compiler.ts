import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataMartSchema, DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  QueryBuildResult,
  isQueryBuildResult,
} from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  EffectiveDataQualityRuleConfig as DataQualityRuleConfig,
  EffectiveDataQualityRuleConfigSchema as DataQualityRuleConfigSchema,
  DataQualityTimezoneSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import {
  DataQualityCanonicalType,
  DataQualitySqlDialect,
  createDataQualitySqlDialectRegistry,
  sourceCte,
} from './data-quality-sql-dialect';

export enum DataQualityQueryPurpose {
  MEASUREMENT = 'MEASUREMENT',
  EXAMPLES = 'EXAMPLES',
  TYPE_INTROSPECTION = 'TYPE_INTROSPECTION',
  METADATA_FRESHNESS = 'METADATA_FRESHNESS',
}

export interface DataQualityCompiledQuery {
  purpose: DataQualityQueryPurpose;
  sql: string;
}

export type DataQualityExecutionStrategy = 'COUNT' | 'TYPE_MISMATCH' | 'METADATA_FRESHNESS';

interface DataQualityCompiledBase {
  category: DataQualityCategory;
  ruleKey: string;
  severity: DataQualityRuleConfig['severity'];
}

export interface DataQualityExecutableCheck extends DataQualityCompiledBase {
  kind: 'EXECUTABLE';
  strategy: DataQualityExecutionStrategy;
  queries: DataQualityCompiledQuery[];
  reproductionSql: string;
  expectedType?: DataQualityCanonicalType;
  expectedNativeType?: string;
  expectedMode?: string;
  thresholdHours?: number;
}

export interface DataQualityNotApplicableCheck extends DataQualityCompiledBase {
  kind: 'NOT_APPLICABLE';
  reason: string;
  queries: [];
  reproductionSql: null;
}

export type DataQualityCompiledCheck = DataQualityExecutableCheck | DataQualityNotApplicableCheck;

export interface DataQualityRelationshipCompileContext {
  snapshot: DataQualityRelationshipSnapshot;
  /** Existing eager input retained for direct compiler callers. */
  targetSourceQuery?: string | QueryBuildResult;
  /** Preferred runtime input: invoked only after relationship applicability is validated. */
  resolveTargetSourceQuery?: () => Promise<string | QueryBuildResult>;
  targetSchema: DataMartSchema | null;
  targetStorageType: DataStorageType;
  sourceConnectionId: string;
  targetConnectionId: string;
}

export interface DataQualityCompileInput {
  storageType: DataStorageType;
  sourceQuery: string | QueryBuildResult;
  schema: DataMartSchema | null;
  timezone: string;
  rule: DataQualityRuleConfig;
  definitionType?: DataMartDefinitionType;
  definition?: DataMartDefinition;
  relationship?: DataQualityRelationshipCompileContext;
}

interface DataQualityFieldDescriptor {
  id: string;
  type: string;
  mode?: string;
  isPrimaryKey: boolean;
  requiresFlattening: boolean;
}

const NESTED_COLLECTION_FIELD_REASON =
  'Nested field is inside a repeated, array, map, or semi-structured container and requires provider-specific flattening';

export class DataQualityCheckCompiler {
  constructor(
    private readonly dialectResolver: TypeResolver<DataStorageType, DataQualitySqlDialect>
  ) {}

  async compile(rawInput: DataQualityCompileInput): Promise<DataQualityCompiledCheck> {
    const timezoneResult = DataQualityTimezoneSchema.safeParse(rawInput.timezone);
    if (!timezoneResult.success) {
      throw new Error(`Invalid Data Quality timezone: ${timezoneResult.error.issues[0]?.message}`);
    }
    const rule = DataQualityRuleConfigSchema.parse(rawInput.rule);
    const input = { ...rawInput, timezone: timezoneResult.data, rule };
    const dialect = await this.dialectResolver.resolve(input.storageType);
    const sourceSql = extractSql(input.sourceQuery);

    if (!rule.enabled) return notApplicable(rule, 'The check is disabled');
    if (!rule.isApplicable) {
      return notApplicable(rule, rule.notApplicableReason ?? 'The check is not applicable');
    }
    if (rule.scope.type === DataQualityScope.FIELD) {
      const field = resolveFieldRule(rule, input.schema);
      if (field?.requiresFlattening) {
        return notApplicable(rule, NESTED_COLLECTION_FIELD_REASON);
      }
    }

    switch (rule.category) {
      case DataQualityCategory.EMPTY_TABLE:
        return this.compileEmptyTable(rule, sourceSql, dialect);
      case DataQualityCategory.PK_UNIQUENESS:
        return this.compilePkUniqueness(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.DUPLICATE_ROWS:
        return this.compileDuplicateRows(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.NULL_RATE:
        return this.compileNullRate(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.COLUMN_UNIQUENESS:
        return this.compileColumnUniqueness(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.CONSTANT_COLUMN:
        return this.compileConstantColumn(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.TYPE_MISMATCH:
        return this.compileTypeMismatch(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.DATA_FRESHNESS:
        return this.compileDataFreshness(input, sourceSql, dialect);
      case DataQualityCategory.FUTURE_VALUES:
        return this.compileFutureValues(rule, sourceSql, input.schema, input.timezone, dialect);
      case DataQualityCategory.NEGATIVE_VALUES:
        return this.compileNegativeValues(rule, sourceSql, input.schema, dialect);
      case DataQualityCategory.RELATIONSHIP_INTEGRITY:
        return this.compileRelationship(input, sourceSql, dialect, false);
      case DataQualityCategory.REVERSE_RELATIONSHIP:
        return this.compileRelationship(input, sourceSql, dialect, true);
    }
  }

  private compileEmptyTable(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    dialect: DataQualitySqlDialect
  ): DataQualityExecutableCheck {
    const prefix = withCtes(sourceSql, [
      'dq_stats AS (SELECT COUNT(*) AS row_count FROM dq_source)',
    ]);
    const reproductionSql = `${prefix}\nSELECT 1 AS empty_table FROM dq_stats WHERE row_count = 0`;
    const measurementSql = `${prefix}\nSELECT CASE WHEN row_count = 0 THEN 1 ELSE 0 END AS violation_count, 1 AS is_applicable FROM dq_stats`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(reproductionSql, 3)),
    ]);
  }

  private compilePkUniqueness(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const primaryKeys = collectFields(schema).filter(field => field.isPrimaryKey);
    if (primaryKeys.length === 0) {
      return notApplicable(rule, 'No primary key fields are configured in the Output Schema');
    }
    if (primaryKeys.some(field => field.requiresFlattening)) {
      return notApplicable(rule, NESTED_COLLECTION_FIELD_REASON);
    }
    const expressions = primaryKeys.map(field => dialect.quoteIdentifier(field.id));
    const selected = expressions.map((expression, index) => `${expression} AS dq_pk_${index}`);
    const nonNull = expressions.map(expression => `${expression} IS NOT NULL`).join(' AND ');
    const groups = `dq_duplicate_groups AS (\n  SELECT ${selected.join(', ')}, COUNT(*) - 1 AS dq_extra_rows\n  FROM dq_source\n  WHERE ${nonNull}\n  GROUP BY ${expressions.join(', ')}\n  HAVING COUNT(*) > 1\n)`;
    const prefix = withCtes(sourceSql, [groups]);
    const reproductionSql = `${prefix}\nSELECT * FROM dq_duplicate_groups`;
    const measurementSql = `${prefix}\nSELECT COALESCE(SUM(dq_extra_rows), 0) AS violation_count, 1 AS is_applicable FROM dq_duplicate_groups`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(reproductionSql, 3)),
    ]);
  }

  private compileDuplicateRows(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const fields = collectTopLevelMaterializedFields(schema);
    if (fields.length === 0) {
      return notApplicable(rule, 'No connected materialized Output Schema fields are available');
    }
    const canonicalFields = fields.map(field => {
      const type = dialect.normalizeType(field.type);
      return type ? dialect.canonicalizeForGrouping(dialect.quoteIdentifier(field.id), type) : null;
    });
    const unsupportedIndex = canonicalFields.findIndex(expression => !expression);
    if (unsupportedIndex >= 0) {
      return notApplicable(
        rule,
        `Field ${fields[unsupportedIndex].id} cannot be canonicalized for duplicate comparison`
      );
    }
    const expressions = canonicalFields as string[];
    const selected = expressions.map((expression, index) => `${expression} AS dq_col_${index}`);
    const groups = `dq_duplicate_groups AS (\n  SELECT ${selected.join(', ')}, COUNT(*) - 1 AS dq_extra_rows\n  FROM dq_source\n  GROUP BY ${expressions.join(', ')}\n  HAVING COUNT(*) > 1\n)`;
    const prefix = withCtes(sourceSql, [groups]);
    const reproductionSql = `${prefix}\nSELECT * FROM dq_duplicate_groups`;
    const measurementSql = `${prefix}\nSELECT COALESCE(SUM(dq_extra_rows), 0) AS violation_count, 1 AS is_applicable FROM dq_duplicate_groups`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(reproductionSql, 3)),
    ]);
  }

  private compileNullRate(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const threshold = rule.parameters.thresholdPercent;
    if (threshold === undefined) {
      return notApplicable(rule, 'null_rate requires thresholdPercent');
    }
    const expression = dialect.quoteIdentifier(field.id);
    const stats = `dq_stats AS (\n  SELECT COUNT(*) AS row_count, SUM(CASE WHEN ${expression} IS NULL THEN 1 ELSE 0 END) AS null_count\n  FROM dq_source\n)`;
    const prefix = withCtes(sourceSql, [stats]);
    const ratio = dialect.safePercent('null_count', 'row_count');
    const measurementSql = `${prefix}\nSELECT CASE WHEN row_count = 0 THEN 0 WHEN ${ratio} > ${formatNumber(threshold)} THEN null_count ELSE 0 END AS violation_count, CASE WHEN row_count = 0 THEN 0 ELSE 1 END AS is_applicable FROM dq_stats`;
    const reproductionSql = `${prefix}\nSELECT s.* FROM dq_source s CROSS JOIN dq_stats WHERE s.${expression} IS NULL AND row_count > 0 AND ${ratio} > ${formatNumber(threshold)}`;
    const exampleProjection = fieldExampleProjection(field, collectFields(schema), dialect, 's');
    const exampleSql = `${prefix}\nSELECT ${exampleProjection} FROM dq_source s CROSS JOIN dq_stats WHERE s.${expression} IS NULL AND row_count > 0 AND ${ratio} > ${formatNumber(threshold)}`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSql, 3)),
    ]);
  }

  private compileColumnUniqueness(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const nativeExpression = dialect.quoteIdentifier(field.id);
    const type = dialect.normalizeType(field.type);
    const expression = type ? dialect.canonicalizeForGrouping(nativeExpression, type) : null;
    if (!expression) return notApplicable(rule, `Field ${field.id} cannot be grouped safely`);
    const qualifiedNativeExpression = `s.${nativeExpression}`;
    const qualifiedExpression = dialect.canonicalizeForGrouping(qualifiedNativeExpression, type!);
    const groups = `dq_duplicate_groups AS (\n  SELECT ${expression} AS dq_value, COUNT(*) - 1 AS dq_extra_rows\n  FROM dq_source\n  WHERE ${nativeExpression} IS NOT NULL\n  GROUP BY ${expression}\n  HAVING COUNT(*) > 1\n)`;
    const violations = `dq_violations AS (SELECT s.* FROM dq_source s JOIN dq_duplicate_groups g ON ${dialect.nullSafeEquals(qualifiedExpression!, 'g.dq_value')} WHERE ${qualifiedNativeExpression} IS NOT NULL)`;
    const prefix = withCtes(sourceSql, [groups, violations]);
    const reproductionSql = `${prefix}\nSELECT * FROM dq_violations`;
    const measurementSql = `${prefix}\nSELECT COALESCE(SUM(dq_extra_rows), 0) AS violation_count, 1 AS is_applicable FROM dq_duplicate_groups`;
    const exampleProjection = fieldExampleProjection(field, collectFields(schema), dialect, 'v');
    const exampleSql = `${prefix}\nSELECT ${exampleProjection} FROM dq_violations v`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSql, 3)),
    ]);
  }

  private compileConstantColumn(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const nativeExpression = dialect.quoteIdentifier(field.id);
    const type = dialect.normalizeType(field.type);
    const expression = type ? dialect.canonicalizeForGrouping(nativeExpression, type) : null;
    if (!expression) return notApplicable(rule, `Field ${field.id} cannot be grouped safely`);
    const stats = `dq_stats AS (\n  SELECT COUNT(*) AS row_count, COUNT(DISTINCT ${expression}) + CASE WHEN COUNT(*) > COUNT(${expression}) THEN 1 ELSE 0 END AS distinct_count\n  FROM dq_source\n)`;
    const prefix = withCtes(sourceSql, [stats]);
    const measurementSql = `${prefix}\nSELECT CASE WHEN row_count = 0 THEN 0 WHEN distinct_count = 1 THEN 1 ELSE 0 END AS violation_count, CASE WHEN row_count = 0 THEN 0 ELSE 1 END AS is_applicable FROM dq_stats`;
    const reproductionSql = `${prefix}\nSELECT s.* FROM dq_source s CROSS JOIN dq_stats WHERE row_count > 0 AND distinct_count = 1`;
    const exampleProjection = fieldExampleProjection(field, collectFields(schema), dialect, 's');
    const exampleSql = `${prefix}\nSELECT ${exampleProjection} FROM dq_source s CROSS JOIN dq_stats WHERE row_count > 0 AND distinct_count = 1`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSql, 3)),
    ]);
  }

  private compileTypeMismatch(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const expectedType = dialect.normalizeType(field.type);
    if (!expectedType) {
      return notApplicable(rule, `Output Schema type ${field.type} is not supported`);
    }
    const expression = dialect.quoteIdentifier(field.id);
    const introspectionSql = dialect.typeIntrospectionSql(sourceSql, expression);
    const locator = fieldExampleProjection(field, collectFields(schema), dialect, 's');
    const exampleSourceSql = `${sourceCte(sourceSql)}\nSELECT ${locator} FROM dq_source s WHERE s.${expression} IS NOT NULL`;
    const expectedLabel = field.mode ? `${field.type} (${field.mode})` : field.type;
    const reproductionSql = `-- Expected Output Schema type: ${expectedLabel}\n${introspectionSql}`;
    return executable(
      rule,
      'TYPE_MISMATCH',
      reproductionSql,
      [
        query(DataQualityQueryPurpose.TYPE_INTROSPECTION, introspectionSql),
        query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSourceSql, 3)),
      ],
      { expectedType, expectedNativeType: field.type, expectedMode: field.mode }
    );
  }

  private compileDataFreshness(
    input: DataQualityCompileInput & { rule: DataQualityRuleConfig },
    sourceSql: string,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const thresholdHours = input.rule.parameters.thresholdHours;
    if (thresholdHours === undefined) {
      return notApplicable(input.rule, 'data_freshness requires thresholdHours');
    }
    const isPhysical =
      input.definitionType === DataMartDefinitionType.TABLE ||
      input.definitionType === DataMartDefinitionType.CONNECTOR;
    if (isPhysical && input.rule.scope.type !== DataQualityScope.DATA_MART) {
      return notApplicable(input.rule, 'Physical freshness uses table last-modified metadata');
    }
    if (!isPhysical && input.rule.scope.type !== DataQualityScope.FIELD) {
      return notApplicable(input.rule, 'Logical freshness requires a configured field');
    }
    if (isPhysical) {
      const fullyQualifiedName = getFullyQualifiedName(input.definition);
      if (!fullyQualifiedName) {
        return notApplicable(input.rule, 'Physical freshness requires a table reference');
      }
      const metadataSql = dialect.tableLastModifiedSql(fullyQualifiedName);
      if (!metadataSql) {
        return notApplicable(input.rule, 'Last-modified metadata is unavailable for this storage');
      }
      return executable(
        input.rule,
        'METADATA_FRESHNESS',
        dialect.metadataFreshnessReproductionSql(metadataSql, thresholdHours),
        [query(DataQualityQueryPurpose.METADATA_FRESHNESS, metadataSql)],
        { thresholdHours }
      );
    }

    const field = resolveFieldRule(input.rule, input.schema);
    if (!field) {
      return notApplicable(input.rule, 'Query freshness requires a configured Output Schema field');
    }
    const type = dialect.normalizeType(field.type);
    if (type !== DataQualityCanonicalType.DATE && type !== DataQualityCanonicalType.TIMESTAMP) {
      return notApplicable(input.rule, 'Freshness field must be DATE or TIMESTAMP');
    }
    const current = dialect.freshnessCurrent(field.type, input.timezone);
    const freshnessValue = dialect.freshnessTimestamp('max_value', field.type, input.timezone);
    if (!current || !freshnessValue) {
      return notApplicable(input.rule, 'Freshness field temporal kind is not supported');
    }
    const expression = dialect.quoteIdentifier(field.id);
    const cutoff = dialect.subtractHours(current, thresholdHours);
    const stats = `dq_stats AS (SELECT COUNT(*) AS row_count, MAX(${expression}) AS max_value FROM dq_source)`;
    const prefix = withCtes(sourceSql, [stats]);
    const measurementSql = `${prefix}\nSELECT CASE WHEN row_count = 0 THEN 0 WHEN max_value IS NULL THEN 1 WHEN ${freshnessValue} < ${cutoff} THEN 1 ELSE 0 END AS violation_count, CASE WHEN row_count = 0 THEN 0 ELSE 1 END AS is_applicable FROM dq_stats`;
    const freshnessPredicate = `row_count > 0 AND (max_value IS NULL OR ${freshnessValue} < ${cutoff})`;
    const qualifiedExpression = `s.${expression}`;
    const relevantRow = dialect.nullSafeEquals(qualifiedExpression, 'max_value');
    const reproductionSql = `${prefix}\nSELECT s.* FROM dq_source s CROSS JOIN dq_stats WHERE ${freshnessPredicate} AND ${relevantRow}`;
    const exampleProjection = fieldExampleProjection(
      field,
      collectFields(input.schema),
      dialect,
      's'
    );
    const exampleSql = `${prefix}\nSELECT ${exampleProjection} FROM dq_source s CROSS JOIN dq_stats WHERE ${freshnessPredicate} AND ${relevantRow}`;
    return executable(
      input.rule,
      'COUNT',
      reproductionSql,
      [
        query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
        query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSql, 3)),
      ],
      { thresholdHours }
    );
  }

  private compileFutureValues(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    timezone: string,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const current = dialect.currentTemporal(field.type, timezone);
    if (!current) return notApplicable(rule, 'future_values requires a DATE or TIMESTAMP field');
    const expression = dialect.quoteIdentifier(field.id);
    return this.compileRowPredicate(
      rule,
      sourceSql,
      field,
      `${expression} IS NOT NULL AND ${expression} > ${current}`,
      schema,
      dialect
    );
  }

  private compileNegativeValues(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const type = dialect.normalizeType(field.type);
    if (
      type !== DataQualityCanonicalType.INTEGER &&
      type !== DataQualityCanonicalType.FLOAT &&
      type !== DataQualityCanonicalType.DECIMAL
    ) {
      return notApplicable(rule, 'negative_values requires a numeric field');
    }
    const expression = dialect.quoteIdentifier(field.id);
    return this.compileRowPredicate(
      rule,
      sourceSql,
      field,
      `${expression} IS NOT NULL AND ${expression} < 0`,
      schema,
      dialect
    );
  }

  private compileRowPredicate(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    field: DataQualityFieldDescriptor,
    predicate: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityExecutableCheck {
    const prefix = withCtes(sourceSql, [
      `dq_violations AS (SELECT * FROM dq_source WHERE ${predicate})`,
    ]);
    const measurementSql = `${prefix}\nSELECT COUNT(*) AS violation_count, 1 AS is_applicable FROM dq_violations`;
    const reproductionSql = `${prefix}\nSELECT * FROM dq_violations`;
    const exampleProjection = fieldExampleProjection(field, collectFields(schema), dialect, 'v');
    const exampleSql = `${prefix}\nSELECT ${exampleProjection} FROM dq_violations v`;
    return executable(rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSql, 3)),
    ]);
  }

  private async compileRelationship(
    input: DataQualityCompileInput & { rule: DataQualityRuleConfig },
    sourceSql: string,
    dialect: DataQualitySqlDialect,
    reverse: boolean
  ): Promise<DataQualityCompiledCheck> {
    const relationship = input.relationship;
    if (!relationship) return notApplicable(input.rule, 'Relationship snapshot is unavailable');
    if (relationship.targetStorageType !== input.storageType) {
      return notApplicable(input.rule, 'Relationship storage types are incompatible');
    }
    if (relationship.sourceConnectionId !== relationship.targetConnectionId) {
      return notApplicable(input.rule, 'Relationship connections are incompatible');
    }
    if (relationship.snapshot.joinConditions.length === 0) {
      return notApplicable(input.rule, 'Relationship has no join conditions');
    }
    const sourceFields = new Map(collectFields(input.schema).map(field => [field.id, field]));
    const targetFields = new Map(
      collectFields(relationship.targetSchema).map(field => [field.id, field])
    );
    const missing = relationship.snapshot.joinConditions.find(
      condition =>
        !sourceFields.has(condition.sourceFieldName) || !targetFields.has(condition.targetFieldName)
    );
    if (missing)
      return notApplicable(input.rule, 'Relationship fields are missing from Output Schema');
    const requiresFlattening = relationship.snapshot.joinConditions.some(condition => {
      const sourceField = sourceFields.get(condition.sourceFieldName);
      const targetField = targetFields.get(condition.targetFieldName);
      return sourceField?.requiresFlattening || targetField?.requiresFlattening;
    });
    if (requiresFlattening) {
      return notApplicable(input.rule, NESTED_COLLECTION_FIELD_REASON);
    }

    const targetSourceQuery = relationship.resolveTargetSourceQuery
      ? await relationship.resolveTargetSourceQuery()
      : relationship.targetSourceQuery;
    if (targetSourceQuery === undefined) {
      return notApplicable(input.rule, 'Relationship target source is unavailable');
    }
    const targetSql = extractSql(targetSourceQuery);
    const base = relationshipSourceCtes(sourceSql, targetSql);
    const tupleSide = reverse ? 't' : 's';
    const tupleFields = relationship.snapshot.joinConditions.map(condition =>
      dialect.quoteIdentifier(reverse ? condition.targetFieldName : condition.sourceFieldName)
    );
    const nonNull = tupleFields
      .map(expression => `${tupleSide}.${expression} IS NOT NULL`)
      .join(' AND ');
    const equality = relationship.snapshot.joinConditions
      .map(condition =>
        dialect.nullSafeEquals(
          `s.${dialect.quoteIdentifier(condition.sourceFieldName)}`,
          `t.${dialect.quoteIdentifier(condition.targetFieldName)}`
        )
      )
      .join(' AND ');
    const primary = reverse ? 'dq_target t' : 'dq_source s';
    const secondary = reverse ? 'dq_source s' : 'dq_target t';
    const violationAlias = reverse ? 't' : 's';
    const violations = `dq_violations AS (SELECT ${violationAlias}.* FROM ${primary} WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${secondary} WHERE ${equality}))`;
    const prefix = `${base},\n${violations}`;
    const measurementSql = `${prefix}\nSELECT COUNT(*) AS violation_count, 1 AS is_applicable FROM dq_violations`;
    const reproductionSql = `${prefix}\nSELECT * FROM dq_violations`;
    const projectionFields = reverse
      ? relationship.snapshot.joinConditions.map(condition => condition.targetFieldName)
      : relationship.snapshot.joinConditions.map(condition => condition.sourceFieldName);
    const schemaFields = reverse
      ? collectFields(relationship.targetSchema)
      : collectFields(input.schema);
    const projection = relationshipExampleProjection(projectionFields, schemaFields, dialect, 'v');
    const exampleSql = `${prefix}\nSELECT ${projection} FROM dq_violations v`;
    return executable(input.rule, 'COUNT', reproductionSql, [
      query(DataQualityQueryPurpose.MEASUREMENT, measurementSql),
      query(DataQualityQueryPurpose.EXAMPLES, dialect.limit(exampleSql, 3)),
    ]);
  }
}

export function createDataQualityCheckCompiler(): DataQualityCheckCompiler {
  return new DataQualityCheckCompiler(createDataQualitySqlDialectRegistry());
}

function query(purpose: DataQualityQueryPurpose, sql: string): DataQualityCompiledQuery {
  return { purpose, sql };
}

function executable(
  rule: DataQualityRuleConfig,
  strategy: DataQualityExecutionStrategy,
  reproductionSql: string,
  queries: DataQualityCompiledQuery[],
  metadata: Pick<
    DataQualityExecutableCheck,
    'expectedType' | 'expectedNativeType' | 'expectedMode' | 'thresholdHours'
  > = {}
): DataQualityExecutableCheck {
  return {
    kind: 'EXECUTABLE',
    category: rule.category,
    ruleKey: rule.key,
    severity: rule.severity,
    strategy,
    queries,
    reproductionSql,
    ...metadata,
  };
}

function notApplicable(rule: DataQualityRuleConfig, reason: string): DataQualityNotApplicableCheck {
  return {
    kind: 'NOT_APPLICABLE',
    category: rule.category,
    ruleKey: rule.key,
    severity: rule.severity,
    reason,
    queries: [],
    reproductionSql: null,
  };
}

function extractSql(queryValue: string | QueryBuildResult): string {
  if (!isQueryBuildResult(queryValue)) return ensureSourceSql(queryValue);
  if (queryValue.params?.length) {
    throw new Error('Data Quality source SQL must not contain unresolved parameters');
  }
  return ensureSourceSql(queryValue.sql);
}

function ensureSourceSql(sql: string): string {
  const normalized = sql.trim().replace(/;\s*$/, '');
  if (!normalized) throw new Error('Data Quality source SQL must not be empty');
  return normalized;
}

function withCtes(sourceSql: string, ctes: string[]): string {
  return `${sourceCte(sourceSql)},\n${ctes.join(',\n')}`;
}

function relationshipSourceCtes(sourceSql: string, targetSql: string): string {
  const source = ensureSourceSql(sourceSql);
  const target = ensureSourceSql(targetSql);
  return `WITH dq_source AS (\n${source}\n),\ndq_target AS (\n${target}\n)`;
}

function collectFields(
  schema: DataMartSchema | null,
  prefix = '',
  ancestorRequiresFlattening = false
): DataQualityFieldDescriptor[] {
  if (!schema) return [];
  return collectFieldList(
    schema.fields as readonly DataMartSchemaField[],
    prefix,
    ancestorRequiresFlattening
  );
}

function collectFieldList(
  fields: readonly DataMartSchemaField[],
  prefix: string,
  ancestorRequiresFlattening: boolean
): DataQualityFieldDescriptor[] {
  const result: DataQualityFieldDescriptor[] = [];
  for (const field of fields) {
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const id = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({
      id,
      type: String(field.type),
      mode: 'mode' in field && typeof field.mode === 'string' ? field.mode : undefined,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      requiresFlattening: ancestorRequiresFlattening,
    });
    if ('fields' in field && field.fields?.length) {
      result.push(
        ...collectFieldList(
          field.fields,
          id,
          ancestorRequiresFlattening || descendantsRequireFlattening(field)
        )
      );
    }
  }
  return result;
}

function collectTopLevelMaterializedFields(
  schema: DataMartSchema | null
): DataQualityFieldDescriptor[] {
  if (!schema) return [];
  return (schema.fields as readonly DataMartSchemaField[])
    .filter(field => field.status !== DataMartSchemaFieldStatus.DISCONNECTED)
    .map(field => ({
      id: field.name,
      type: String(field.type),
      mode: 'mode' in field && typeof field.mode === 'string' ? field.mode : undefined,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      requiresFlattening: false,
    }));
}

function descendantsRequireFlattening(field: DataMartSchemaField): boolean {
  const mode = 'mode' in field && typeof field.mode === 'string' ? field.mode.toUpperCase() : '';
  const type = String(field.type).trim().toUpperCase();
  return mode === 'REPEATED' || type === 'VARIANT' || /^(?:ARRAY|MAP)(?:$|[<(])/.test(type);
}

function resolveFieldRule(
  rule: DataQualityRuleConfig,
  schema: DataMartSchema | null
): DataQualityFieldDescriptor | null {
  const scope = rule.scope;
  if (scope.type !== DataQualityScope.FIELD) return null;
  return collectFields(schema).find(field => field.id === scope.fieldId) ?? null;
}

function fieldExampleProjection(
  field: DataQualityFieldDescriptor,
  fields: DataQualityFieldDescriptor[],
  dialect: DataQualitySqlDialect,
  alias: string
): string {
  const parts = [
    `${alias}.${dialect.quoteIdentifier(field.id)} AS dq_value`,
    ...fields
      .filter(candidate => candidate.isPrimaryKey && !candidate.requiresFlattening)
      .map(
        (candidate, index) => `${alias}.${dialect.quoteIdentifier(candidate.id)} AS dq_pk_${index}`
      ),
  ];
  return parts.join(', ');
}

function relationshipExampleProjection(
  joinFields: string[],
  fields: DataQualityFieldDescriptor[],
  dialect: DataQualitySqlDialect,
  alias: string
): string {
  return [
    ...joinFields.map(
      (field, index) => `${alias}.${dialect.quoteIdentifier(field)} AS dq_join_${index}`
    ),
    ...fields
      .filter(field => field.isPrimaryKey && !field.requiresFlattening)
      .map((field, index) => `${alias}.${dialect.quoteIdentifier(field.id)} AS dq_pk_${index}`),
  ].join(', ');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Data Quality numeric parameters must be finite and non-negative');
  }
  return String(value);
}

function getFullyQualifiedName(definition?: DataMartDefinition): string | null {
  if (!definition) return null;
  if ('fullyQualifiedName' in definition) return definition.fullyQualifiedName;
  if ('connector' in definition) return definition.connector.storage.fullyQualifiedName;
  return null;
}
