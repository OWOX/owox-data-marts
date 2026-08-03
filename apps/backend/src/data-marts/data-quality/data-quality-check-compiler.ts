import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataMartSchema, DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  QueryBuildResult,
  isQueryBuildResult,
} from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import {
  EffectiveDataQualityRuleConfig as DataQualityRuleConfig,
  EffectiveDataQualityRuleConfigSchema as DataQualityRuleConfigSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { isDataQualityFreshnessTypeSupported } from './data-quality-freshness-support';
import {
  DataQualityCanonicalType,
  DataQualitySqlDialect,
  createDataQualitySqlDialectRegistry,
} from './data-quality-sql-dialect';

export type DataQualityExecutionStrategy = 'COUNT' | 'TYPE_MISMATCH';

export interface DataQualityCompiledResultShape {
  exampleMarkerColumn: string;
  exampleColumns: string[];
  actualTypeColumn?: string;
  actualTypeMetadataColumn?: string;
}

interface DataQualityCompiledBase {
  category: DataQualityCategory;
  ruleKey: string;
  severity: DataQualityRuleConfig['severity'];
}

export interface DataQualityExecutableCheck extends DataQualityCompiledBase {
  kind: 'EXECUTABLE';
  strategy: DataQualityExecutionStrategy;
  sql: string;
  resultShape: DataQualityCompiledResultShape;
  expectedType?: DataQualityCanonicalType;
  expectedNativeType?: string;
  expectedMode?: string;
}

export interface DataQualityNotApplicableCheck extends DataQualityCompiledBase {
  kind: 'NOT_APPLICABLE';
  reason: string;
  sql: null;
}

export type DataQualityCompiledCheck = DataQualityExecutableCheck | DataQualityNotApplicableCheck;

type DataQualityQueryResolver = (columns: string[]) => Promise<string | QueryBuildResult>;

export interface DataQualityRelationshipCompileContext {
  snapshot: DataQualityRelationshipSnapshot;
  /** Existing eager input retained for direct compiler callers. */
  targetSourceQuery?: string | QueryBuildResult;
  /** Preferred runtime input: invoked only after relationship applicability is validated. */
  resolveTargetSourceQuery?: DataQualityQueryResolver;
  targetSchema: DataMartSchema | null;
  targetStorageType: DataStorageType;
  sourceConnectionId: string;
  targetConnectionId: string;
}

export interface DataQualityCompileInput {
  storageType: DataStorageType;
  sourceQuery?: string | QueryBuildResult;
  resolveSourceQuery?: DataQualityQueryResolver;
  schema: DataMartSchema | null;
  rule: DataQualityRuleConfig;
  relationship?: DataQualityRelationshipCompileContext;
}

interface DataQualityFieldDescriptor {
  path: string[];
  type: string;
  mode?: string;
  isPrimaryKey: boolean;
  requiresFlattening: boolean;
  typeIntrospectionRequiresFlattening: boolean;
}

const NESTED_COLLECTION_FIELD_REASON =
  'Nested field is inside a repeated, array, map, or semi-structured container and requires provider-specific flattening';

export class DataQualityCheckCompiler {
  constructor(
    private readonly dialectResolver: TypeResolver<DataStorageType, DataQualitySqlDialect>
  ) {}

  async compile(rawInput: DataQualityCompileInput): Promise<DataQualityCompiledCheck> {
    const rule = DataQualityRuleConfigSchema.parse(rawInput.rule);
    const input = { ...rawInput, rule };
    const dialect = await this.dialectResolver.resolve(input.storageType);

    if (!rule.enabled) return notApplicable(rule, 'The check is disabled');
    if (!rule.isApplicable) {
      return notApplicable(rule, rule.notApplicableReason ?? 'The check is not applicable');
    }
    if (rule.scope.type === DataQualityScope.FIELD) {
      const field = resolveFieldRule(rule, input.schema);
      if (
        field?.requiresFlattening &&
        (rule.category !== DataQualityCategory.TYPE_MISMATCH ||
          field.typeIntrospectionRequiresFlattening)
      ) {
        return notApplicable(rule, NESTED_COLLECTION_FIELD_REASON);
      }
    }
    const sourceSql = await resolveSourceSql(input, dialect);

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
        return this.compileDataFreshness(rule, sourceSql, input.schema, input.storageType, dialect);
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
    _dialect: DataQualitySqlDialect
  ): DataQualityExecutableCheck {
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        ctes: [
          {
            name: 'dq_statistics',
            body: renderSelect(['COUNT(*) AS row_count'], 'dq_source'),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              [
                '1 AS is_applicable',
                renderCase([{ condition: 'row_count = 0', result: '1' }], '0', 'violation_count'),
                'row_count',
              ],
              'dq_statistics'
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count', 'row_count'],
      }),
      []
    );
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
    const expressions = primaryKeys.map(field => dialect.quoteIdentifierPath(field.path));
    const primaryKeyAliases = primaryKeys.map((_field, index) => `primary_key_value_${index + 1}`);
    const selected = expressions.map(
      (expression, index) => `${expression} AS ${primaryKeyAliases[index]}`
    );
    const nonNullPredicates = expressions.map(expression => `${expression} IS NOT NULL`);
    const exampleColumns = [...primaryKeyAliases, 'duplicate_row_count', 'extra_row_count'];
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: primaryKeys.map(
          (field, index) => `${primaryKeyAliases[index]} = ${displayFieldPath(field.path)}`
        ),
        ctes: [
          {
            name: 'dq_duplicate_groups',
            body: renderSelect(
              [...selected, 'COUNT(*) AS duplicate_row_count', 'COUNT(*) - 1 AS extra_row_count'],
              'dq_source',
              {
                where: nonNullPredicates,
                groupBy: expressions,
                having: ['COUNT(*) > 1'],
              }
            ),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              ['1 AS is_applicable', 'COALESCE(SUM(extra_row_count), 0) AS violation_count'],
              'dq_duplicate_groups'
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count'],
        examples: {
          from: 'dq_duplicate_groups AS duplicate_group',
          columns: exampleColumns.map(column => `duplicate_group.${column} AS ${column}`),
          aliases: exampleColumns,
          dialect,
        },
      }),
      exampleColumns
    );
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
      const type = normalizeGroupingType(dialect, field);
      return type
        ? dialect.canonicalizeForGrouping(dialect.quoteIdentifierPath(field.path), type)
        : null;
    });
    const unsupportedIndex = canonicalFields.findIndex(expression => !expression);
    if (unsupportedIndex >= 0) {
      return notApplicable(
        rule,
        `Field ${displayFieldPath(fields[unsupportedIndex].path)} cannot be canonicalized for duplicate comparison`
      );
    }
    const expressions = canonicalFields as string[];
    const valueAliases = fields.map((_field, index) => `duplicate_value_${index + 1}`);
    const selected = expressions.map(
      (expression, index) => `${expression} AS ${valueAliases[index]}`
    );
    const exampleColumns = [...valueAliases, 'duplicate_row_count', 'extra_row_count'];
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: fields.map(
          (field, index) => `${valueAliases[index]} = ${displayFieldPath(field.path)}`
        ),
        ctes: [
          {
            name: 'dq_duplicate_groups',
            body: renderSelect(
              [...selected, 'COUNT(*) AS duplicate_row_count', 'COUNT(*) - 1 AS extra_row_count'],
              'dq_source',
              {
                groupBy: expressions,
                having: ['COUNT(*) > 1'],
              }
            ),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              ['1 AS is_applicable', 'COALESCE(SUM(extra_row_count), 0) AS violation_count'],
              'dq_duplicate_groups'
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count'],
        examples: {
          from: 'dq_duplicate_groups AS duplicate_group',
          columns: exampleColumns.map(column => `duplicate_group.${column} AS ${column}`),
          aliases: exampleColumns,
          dialect,
        },
      }),
      exampleColumns
    );
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
    const expression = dialect.quoteIdentifierPath(field.path);
    const ratio = dialect.safePercent('null_count', 'row_count');
    const thresholdSql = formatNumber(threshold);
    const projection = readableFieldExampleProjection(
      field,
      collectFields(schema),
      dialect,
      'source',
      'null_value'
    );
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: [
          `Field: ${displayFieldPath(field.path)}`,
          `Maximum null rate: ${thresholdSql}%`,
          ...fieldAliasMappings(field, collectFields(schema), 'null_value'),
        ],
        ctes: [
          {
            name: 'dq_statistics',
            body: renderSelect(
              [
                'COUNT(*) AS row_count',
                `COALESCE(SUM(CASE WHEN ${expression} IS NULL THEN 1 ELSE 0 END), 0) AS null_count`,
              ],
              'dq_source'
            ),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              [
                renderCase([{ condition: 'row_count = 0', result: '0' }], '1', 'is_applicable'),
                renderCase(
                  [
                    { condition: 'row_count = 0', result: '0' },
                    { condition: `${ratio} > ${thresholdSql}`, result: 'null_count' },
                  ],
                  '0',
                  'violation_count'
                ),
                'row_count',
                'null_count',
                `${ratio} AS null_rate_percent`,
                `${thresholdSql} AS threshold_percent`,
              ],
              'dq_statistics'
            ),
          },
        ],
        summaryColumns: [
          'is_applicable',
          'violation_count',
          'row_count',
          'null_count',
          'null_rate_percent',
          'threshold_percent',
        ],
        examples: {
          from: 'dq_source AS source',
          joins: ['CROSS JOIN dq_summary AS summary'],
          where: ['summary.violation_count > 0', `source.${expression} IS NULL`],
          columns: splitProjection(projection.sql),
          aliases: projection.aliases,
          dialect,
        },
      }),
      projection.aliases
    );
  }

  private compileColumnUniqueness(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const nativeExpression = dialect.quoteIdentifierPath(field.path);
    const type = dialect.normalizeType(field.type);
    if (!type) {
      return notApplicable(rule, `Field ${displayFieldPath(field.path)} cannot be grouped safely`);
    }
    const expression = dialect.canonicalizeForGrouping(nativeExpression, type);
    if (!expression) {
      return notApplicable(rule, `Field ${displayFieldPath(field.path)} cannot be grouped safely`);
    }
    const qualifiedNativeExpression = `source.${nativeExpression}`;
    const qualifiedExpression = dialect.canonicalizeForGrouping(qualifiedNativeExpression, type);
    if (!qualifiedExpression) {
      return notApplicable(rule, `Field ${displayFieldPath(field.path)} cannot be grouped safely`);
    }
    const locatorProjection = readablePrimaryKeyProjection(
      collectFields(schema),
      dialect,
      'source',
      field.path
    );
    const exampleColumns = [
      'duplicate_value',
      'duplicate_row_count',
      'duplicate_occurrence_number',
      ...locatorProjection.aliases,
    ];
    const duplicateOccurrenceNumber = [
      'ROW_NUMBER() OVER (',
      `  PARTITION BY ${qualifiedExpression}`,
      `  ORDER BY ${qualifiedExpression}`,
      ') AS duplicate_occurrence_number',
    ].join('\n');
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: [
          `Field: ${displayFieldPath(field.path)}`,
          `duplicate_value = ${displayFieldPath(field.path)}`,
          ...primaryKeyAliasMappings(collectFields(schema), field.path),
        ],
        ctes: [
          {
            name: 'dq_duplicate_groups',
            body: renderSelect(
              [
                `${expression} AS duplicate_value`,
                'COUNT(*) AS duplicate_row_count',
                'COUNT(*) - 1 AS extra_row_count',
              ],
              'dq_source',
              {
                where: [`${nativeExpression} IS NOT NULL`],
                groupBy: [expression],
                having: ['COUNT(*) > 1'],
              }
            ),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              ['1 AS is_applicable', 'COALESCE(SUM(extra_row_count), 0) AS violation_count'],
              'dq_duplicate_groups'
            ),
          },
          {
            name: 'dq_duplicate_occurrences',
            body: renderSelect(
              [
                `${qualifiedNativeExpression} AS duplicate_value`,
                'duplicate_group.duplicate_row_count AS duplicate_row_count',
                duplicateOccurrenceNumber,
                ...splitProjection(locatorProjection.sql),
              ],
              'dq_source AS source',
              {
                joins: [
                  renderJoinOn(
                    'INNER JOIN dq_duplicate_groups AS duplicate_group',
                    dialect.nullSafeEquals(qualifiedExpression, 'duplicate_group.duplicate_value')
                  ),
                ],
              }
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count'],
        examples: {
          from: 'dq_duplicate_occurrences AS duplicate_occurrence',
          where: ['duplicate_occurrence.duplicate_occurrence_number > 1'],
          columns: exampleColumns.map(column => `duplicate_occurrence.${column} AS ${column}`),
          aliases: exampleColumns,
          dialect,
        },
      }),
      exampleColumns
    );
  }

  private compileConstantColumn(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const field = resolveFieldRule(rule, schema);
    if (!field) return notApplicable(rule, 'The field is missing from the Output Schema');
    const nativeExpression = dialect.quoteIdentifierPath(field.path);
    const type = dialect.normalizeType(field.type);
    const expression = type ? dialect.canonicalizeForGrouping(nativeExpression, type) : null;
    if (!expression) {
      return notApplicable(rule, `Field ${displayFieldPath(field.path)} cannot be grouped safely`);
    }
    const projection = readableFieldExampleProjection(
      field,
      collectFields(schema),
      dialect,
      'source',
      'constant_value'
    );
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: [
          `Field: ${displayFieldPath(field.path)}`,
          ...fieldAliasMappings(field, collectFields(schema), 'constant_value'),
        ],
        ctes: [
          {
            name: 'dq_statistics',
            body: renderSelect(
              [
                'COUNT(*) AS row_count',
                `COUNT(DISTINCT ${expression}) + CASE WHEN COUNT(*) > COUNT(${expression}) THEN 1 ELSE 0 END AS distinct_value_count`,
              ],
              'dq_source'
            ),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              [
                renderCase([{ condition: 'row_count = 0', result: '0' }], '1', 'is_applicable'),
                renderCase(
                  [
                    { condition: 'row_count = 0', result: '0' },
                    { condition: 'distinct_value_count = 1', result: '1' },
                  ],
                  '0',
                  'violation_count'
                ),
                'row_count',
                'distinct_value_count',
              ],
              'dq_statistics'
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count', 'row_count', 'distinct_value_count'],
        examples: {
          from: 'dq_source AS source',
          joins: ['CROSS JOIN dq_summary AS summary'],
          where: ['summary.violation_count > 0'],
          columns: splitProjection(projection.sql),
          aliases: projection.aliases,
          dialect,
          limit: 1,
        },
      }),
      projection.aliases
    );
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
    const expression = dialect.quoteIdentifierPath(field.path);
    const expectedLabel = field.mode ? `${field.type} (${field.mode})` : field.type;
    const projection = readableFieldExampleProjection(
      field,
      collectFields(schema),
      dialect,
      'source',
      'sample_value'
    );
    const actualTypeExpression = dialect.typeIntrospectionExpression(expression);
    const sql = renderUnifiedResult({
      rule,
      sourceSql,
      headerDetails: [
        `Field: ${displayFieldPath(field.path)}`,
        `Expected Output Schema type: ${expectedLabel}`,
        ...fieldAliasMappings(field, collectFields(schema), 'sample_value'),
      ],
      ctes: [
        {
          name: 'dq_runtime_type',
          body: renderSelect([`${actualTypeExpression ?? 'NULL'} AS actual_type`]),
        },
        {
          name: 'dq_summary',
          body: renderSelect(
            [
              '1 AS is_applicable',
              'actual_type',
              `${quoteSqlString(expectedLabel)} AS expected_type`,
            ],
            'dq_runtime_type'
          ),
        },
      ],
      summaryColumns: ['is_applicable', 'actual_type', 'expected_type'],
      examples: {
        from: 'dq_source AS source',
        where: [`source.${expression} IS NOT NULL`],
        columns: splitProjection(projection.sql),
        aliases: projection.aliases,
        dialect,
        limit: 1,
      },
    });
    return executable(rule, 'TYPE_MISMATCH', sql, projection.aliases, {
      expectedType,
      expectedNativeType: field.type,
      expectedMode: field.mode,
    });
  }

  private compileDataFreshness(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    schema: DataMartSchema | null,
    storageType: DataStorageType,
    dialect: DataQualitySqlDialect
  ): DataQualityCompiledCheck {
    const thresholdHours = rule.parameters.thresholdHours;
    if (thresholdHours === undefined) {
      return notApplicable(rule, 'data_freshness requires thresholdHours');
    }

    const field = resolveFieldRule(rule, schema);
    if (!field) {
      return notApplicable(rule, 'Data freshness requires a configured Output Schema field');
    }
    if (!isDataQualityFreshnessTypeSupported(storageType, field.type)) {
      return notApplicable(
        rule,
        'Data freshness is supported only for provider-specific instant timestamp fields'
      );
    }
    const current = dialect.freshnessCurrent(field.type);
    const freshnessValue = dialect.freshnessTimestamp('latest_observed_timestamp', field.type);
    if (!current || !freshnessValue) {
      return notApplicable(rule, 'Freshness field temporal kind is not supported');
    }
    const expression = dialect.quoteIdentifierPath(field.path);
    const cutoff = dialect.subtractHours(current, thresholdHours);
    const projection = readableFieldExampleProjection(
      field,
      collectFields(schema),
      dialect,
      'source',
      'latest_value'
    );
    const qualifiedExpression = `source.${expression}`;
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: [
          `Field: ${displayFieldPath(field.path)}`,
          `Maximum allowed age: ${formatNumber(thresholdHours)} hours`,
          ...fieldAliasMappings(field, collectFields(schema), 'latest_value'),
        ],
        ctes: [
          {
            name: 'dq_statistics',
            body: renderSelect(
              ['COUNT(*) AS row_count', `MAX(${expression}) AS latest_observed_timestamp`],
              'dq_source'
            ),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              [
                renderCase([{ condition: 'row_count = 0', result: '0' }], '1', 'is_applicable'),
                renderCase(
                  [
                    { condition: 'row_count = 0', result: '0' },
                    { condition: 'latest_observed_timestamp IS NULL', result: '1' },
                    { condition: `${freshnessValue} < ${cutoff}`, result: '1' },
                  ],
                  '0',
                  'violation_count'
                ),
                'row_count',
                'latest_observed_timestamp',
                `${cutoff} AS freshness_cutoff_timestamp`,
                `${formatNumber(thresholdHours)} AS threshold_hours`,
              ],
              'dq_statistics'
            ),
          },
        ],
        summaryColumns: [
          'is_applicable',
          'violation_count',
          'row_count',
          'latest_observed_timestamp',
          'freshness_cutoff_timestamp',
          'threshold_hours',
        ],
        examples: {
          from: 'dq_source AS source',
          joins: ['CROSS JOIN dq_summary AS summary'],
          where: [
            'summary.violation_count > 0',
            dialect.nullSafeEquals(qualifiedExpression, 'summary.latest_observed_timestamp'),
          ],
          columns: splitProjection(projection.sql),
          aliases: projection.aliases,
          dialect,
          limit: 1,
        },
      }),
      projection.aliases
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
    const expression = dialect.quoteIdentifierPath(field.path);
    return this.compileRowPredicate(
      rule,
      sourceSql,
      field,
      [`source.${expression} IS NOT NULL`, `source.${expression} < 0`],
      schema,
      dialect
    );
  }

  private compileRowPredicate(
    rule: DataQualityRuleConfig,
    sourceSql: string,
    field: DataQualityFieldDescriptor,
    predicates: string[],
    schema: DataMartSchema | null,
    dialect: DataQualitySqlDialect
  ): DataQualityExecutableCheck {
    const readableExample = readableFieldExampleProjection(
      field,
      collectFields(schema),
      dialect,
      'source',
      'negative_value'
    );
    return executable(
      rule,
      'COUNT',
      renderUnifiedResult({
        rule,
        sourceSql,
        headerDetails: [
          `Field: ${displayFieldPath(field.path)}`,
          ...fieldAliasMappings(field, collectFields(schema), 'negative_value'),
        ],
        ctes: [
          {
            name: 'dq_violations',
            body: renderSelect(splitProjection(readableExample.sql), 'dq_source AS source', {
              where: predicates,
            }),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              ['1 AS is_applicable', 'COUNT(*) AS violation_count'],
              'dq_violations'
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count'],
        examples: {
          from: 'dq_violations AS violation',
          columns: readableExample.aliases.map(alias => `violation.${alias} AS ${alias}`),
          aliases: readableExample.aliases,
          dialect,
        },
      }),
      readableExample.aliases
    );
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
    const sourceFields = new Map(
      collectFields(input.schema).map(field => [fieldPathKey(field.path), field])
    );
    const targetFields = new Map(
      collectFields(relationship.targetSchema).map(field => [fieldPathKey(field.path), field])
    );
    const occupiedAliases = new Set(
      [...sourceFields.values(), ...targetFields.values()]
        .filter(field => field.path.length === 1)
        .map(field => field.path[0].toLowerCase())
    );
    const sourceAlias = availableRelationshipAlias('source', occupiedAliases);
    occupiedAliases.add(sourceAlias.toLowerCase());
    const targetAlias = availableRelationshipAlias('target', occupiedAliases);
    const missing = relationship.snapshot.joinConditions.find(
      condition =>
        !sourceFields.has(fieldPathKey([condition.sourceFieldName])) ||
        !targetFields.has(fieldPathKey([condition.targetFieldName]))
    );
    if (missing)
      return notApplicable(input.rule, 'Relationship fields are missing from Output Schema');
    const requiresFlattening = relationship.snapshot.joinConditions.some(condition => {
      const sourceField = sourceFields.get(fieldPathKey([condition.sourceFieldName]));
      const targetField = targetFields.get(fieldPathKey([condition.targetFieldName]));
      return sourceField?.requiresFlattening || targetField?.requiresFlattening;
    });
    if (requiresFlattening) {
      return notApplicable(input.rule, NESTED_COLLECTION_FIELD_REASON);
    }

    const targetColumns = quoteTopLevelColumns(
      [
        ...relationship.snapshot.joinConditions.map(condition => [condition.targetFieldName]),
        ...(reverse
          ? readablePrimaryKeyFields([...targetFields.values()]).map(field => field.path)
          : []),
      ],
      dialect
    );
    const targetSourceQuery = relationship.resolveTargetSourceQuery
      ? await relationship.resolveTargetSourceQuery(targetColumns)
      : relationship.targetSourceQuery;
    if (targetSourceQuery === undefined) {
      return notApplicable(input.rule, 'Relationship target source is unavailable');
    }
    const targetSql = extractSql(targetSourceQuery);
    const tupleSide = reverse ? targetAlias : sourceAlias;
    const tupleFields = relationship.snapshot.joinConditions.map(condition =>
      dialect.quoteIdentifierPath([reverse ? condition.targetFieldName : condition.sourceFieldName])
    );
    const nonNullPredicates = tupleFields.map(
      expression => `${tupleSide}.${expression} IS NOT NULL`
    );
    const equalityPredicates = relationship.snapshot.joinConditions.map(
      condition =>
        `${sourceAlias}.${dialect.quoteIdentifierPath([condition.sourceFieldName])} = ${targetAlias}.${dialect.quoteIdentifierPath([condition.targetFieldName])}`
    );
    const primary = reverse ? `dq_target AS ${targetAlias}` : `dq_source AS ${sourceAlias}`;
    const secondary = reverse ? `dq_source AS ${sourceAlias}` : `dq_target AS ${targetAlias}`;
    const violationAlias = reverse ? targetAlias : sourceAlias;
    const projectionFields = reverse
      ? relationship.snapshot.joinConditions.map(condition => condition.targetFieldName)
      : relationship.snapshot.joinConditions.map(condition => condition.sourceFieldName);
    const schemaFields = reverse
      ? collectFields(relationship.targetSchema)
      : collectFields(input.schema);
    const projection = readableRelationshipExampleProjection(
      projectionFields,
      schemaFields,
      dialect,
      violationAlias,
      reverse ? 'target_join_value' : 'source_join_value'
    );
    const joinMappings = relationship.snapshot.joinConditions.map(
      (condition, index) =>
        `${reverse ? 'target_join_value' : 'source_join_value'}_${index + 1} = ${
          reverse ? condition.targetFieldName : condition.sourceFieldName
        }`
    );
    const relationshipMappings = relationship.snapshot.joinConditions.map(
      condition => `${condition.sourceFieldName} -> ${condition.targetFieldName}`
    );
    return executable(
      input.rule,
      'COUNT',
      renderUnifiedResult({
        rule: input.rule,
        sourceSql,
        targetSql,
        headerDetails: [
          `Relationship: ${relationship.snapshot.targetAlias}`,
          ...relationshipMappings.map(mapping => `Join: ${mapping}`),
          ...joinMappings,
          ...primaryKeyAliasMappings(schemaFields),
        ],
        ctes: [
          {
            name: 'dq_violations',
            body: renderSelect(splitProjection(projection.sql), primary, {
              where: [
                ...nonNullPredicates,
                [
                  'NOT EXISTS (',
                  indentContinuation(
                    renderSelect(['1'], secondary, { where: equalityPredicates }),
                    2
                  ),
                  ')',
                ].join('\n'),
              ],
            }),
          },
          {
            name: 'dq_summary',
            body: renderSelect(
              ['1 AS is_applicable', 'COUNT(*) AS violation_count'],
              'dq_violations'
            ),
          },
        ],
        summaryColumns: ['is_applicable', 'violation_count'],
        examples: {
          from: 'dq_violations AS violation',
          columns: projection.aliases.map(alias => `violation.${alias} AS ${alias}`),
          aliases: projection.aliases,
          dialect,
        },
      }),
      projection.aliases
    );
  }
}

export function createDataQualityCheckCompiler(): DataQualityCheckCompiler {
  return new DataQualityCheckCompiler(createDataQualitySqlDialectRegistry());
}

function executable(
  rule: DataQualityRuleConfig,
  strategy: DataQualityExecutionStrategy,
  sql: string,
  exampleColumns: string[],
  metadata: Pick<
    DataQualityExecutableCheck,
    'expectedType' | 'expectedNativeType' | 'expectedMode'
  > = {}
): DataQualityExecutableCheck {
  return {
    kind: 'EXECUTABLE',
    category: rule.category,
    ruleKey: rule.key,
    severity: rule.severity,
    strategy,
    sql,
    resultShape: {
      exampleMarkerColumn: 'example_available',
      exampleColumns,
      ...(strategy === 'TYPE_MISMATCH'
        ? {
            actualTypeColumn: 'actual_type',
            ...(exampleColumns.includes('sample_value')
              ? { actualTypeMetadataColumn: 'sample_value' }
              : {}),
          }
        : {}),
    },
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
    sql: null,
  };
}

async function resolveSourceSql(
  input: DataQualityCompileInput & { rule: DataQualityRuleConfig },
  dialect: DataQualitySqlDialect
): Promise<string> {
  const query = input.resolveSourceQuery
    ? await input.resolveSourceQuery(requiredSourceColumns(input, dialect))
    : input.sourceQuery;
  if (query === undefined) throw new Error('Data Quality source query is unavailable');
  return extractSql(query);
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

function availableRelationshipAlias(preferred: string, occupied: ReadonlySet<string>): string {
  let alias = preferred;
  while (occupied.has(alias.toLowerCase())) alias = `dq_row_${alias}`;
  return alias;
}

function collectFields(
  schema: DataMartSchema | null,
  prefix: readonly string[] = [],
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
  prefix: readonly string[],
  ancestorRequiresFlattening: boolean
): DataQualityFieldDescriptor[] {
  const result: DataQualityFieldDescriptor[] = [];
  for (const field of fields) {
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const path = [...prefix, field.name];
    result.push({
      path,
      type: String(field.type),
      mode: 'mode' in field && typeof field.mode === 'string' ? field.mode : undefined,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      requiresFlattening: ancestorRequiresFlattening || isRepeatedScalar(field),
      typeIntrospectionRequiresFlattening: ancestorRequiresFlattening,
    });
    if ('fields' in field && field.fields?.length) {
      result.push(
        ...collectFieldList(
          field.fields,
          path,
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
      path: [field.name],
      type: String(field.type),
      mode: 'mode' in field && typeof field.mode === 'string' ? field.mode : undefined,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      requiresFlattening: isRepeatedScalar(field),
      typeIntrospectionRequiresFlattening: false,
    }));
}

function requiredSourceColumns(
  input: DataQualityCompileInput & { rule: DataQualityRuleConfig },
  dialect: DataQualitySqlDialect
): string[] {
  const fields = collectFields(input.schema);
  const primaryKeys = readablePrimaryKeyFields(fields);
  switch (input.rule.category) {
    case DataQualityCategory.EMPTY_TABLE:
      return quoteTopLevelColumns(
        collectTopLevelMaterializedFields(input.schema)
          .slice(0, 1)
          .map(field => field.path),
        dialect
      );
    case DataQualityCategory.PK_UNIQUENESS:
      return quoteTopLevelColumns(
        fields.filter(field => field.isPrimaryKey).map(field => field.path),
        dialect
      );
    case DataQualityCategory.DUPLICATE_ROWS:
      return [];
    case DataQualityCategory.RELATIONSHIP_INTEGRITY:
    case DataQualityCategory.REVERSE_RELATIONSHIP:
      return quoteTopLevelColumns(
        [
          ...(input.relationship?.snapshot.joinConditions.map(condition => [
            condition.sourceFieldName,
          ]) ?? []),
          ...(input.rule.category === DataQualityCategory.RELATIONSHIP_INTEGRITY
            ? primaryKeys.map(field => field.path)
            : []),
        ],
        dialect
      );
    default: {
      const field = resolveFieldRule(input.rule, input.schema);
      return quoteTopLevelColumns(
        field ? [field.path, ...primaryKeys.map(primaryKey => primaryKey.path)] : [],
        dialect
      );
    }
  }
}

function quoteTopLevelColumns(
  paths: readonly (readonly string[])[],
  dialect: DataQualitySqlDialect
): string[] {
  const names = new Set<string>();
  for (const path of paths) {
    if (path[0]) names.add(path[0]);
  }
  return [...names].map(name => dialect.quoteIdentifierPath([name]));
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

function resolveFieldRule(
  rule: DataQualityRuleConfig,
  schema: DataMartSchema | null
): DataQualityFieldDescriptor | null {
  const scope = rule.scope;
  if (scope.type !== DataQualityScope.FIELD) return null;
  const scopeKey = fieldPathKey(scope.fieldPath);
  return collectFields(schema).find(field => fieldPathKey(field.path) === scopeKey) ?? null;
}

function readablePrimaryKeyFields(
  fields: DataQualityFieldDescriptor[],
  excludedFieldPath?: readonly string[]
): DataQualityFieldDescriptor[] {
  return fields.filter(
    field =>
      field.isPrimaryKey &&
      !field.requiresFlattening &&
      (!excludedFieldPath || fieldPathKey(field.path) !== fieldPathKey(excludedFieldPath))
  );
}

function readableFieldExampleProjection(
  field: DataQualityFieldDescriptor,
  fields: DataQualityFieldDescriptor[],
  dialect: DataQualitySqlDialect,
  alias: string,
  valueAlias: string
): { sql: string; aliases: string[] } {
  const primaryKeys = readablePrimaryKeyFields(fields, field.path);
  const aliases = [
    valueAlias,
    ...primaryKeys.map((_candidate, index) => `primary_key_value_${index + 1}`),
  ];
  const expressions = [
    `${alias}.${dialect.quoteIdentifierPath(field.path)} AS ${valueAlias}`,
    ...primaryKeys.map(
      (candidate, index) =>
        `${alias}.${dialect.quoteIdentifierPath(candidate.path)} AS primary_key_value_${index + 1}`
    ),
  ];
  return { sql: expressions.join(',\n'), aliases };
}

function readablePrimaryKeyProjection(
  fields: DataQualityFieldDescriptor[],
  dialect: DataQualitySqlDialect,
  tableAlias: string,
  excludedFieldPath?: readonly string[]
): { sql: string; aliases: string[] } {
  const primaryKeys = readablePrimaryKeyFields(fields, excludedFieldPath);
  const aliases = primaryKeys.map((_field, index) => `primary_key_value_${index + 1}`);
  return {
    sql: primaryKeys
      .map(
        (field, index) =>
          `${tableAlias}.${dialect.quoteIdentifierPath(field.path)} AS ${aliases[index]}`
      )
      .join(',\n'),
    aliases,
  };
}

function readableRelationshipExampleProjection(
  joinFields: string[],
  fields: DataQualityFieldDescriptor[],
  dialect: DataQualitySqlDialect,
  tableAlias: string,
  joinAliasPrefix: string
): { sql: string; aliases: string[] } {
  const joinAliases = joinFields.map((_field, index) => `${joinAliasPrefix}_${index + 1}`);
  const primaryKeyProjection = readablePrimaryKeyProjection(fields, dialect, tableAlias);
  const expressions = [
    ...joinFields.map(
      (field, index) =>
        `${tableAlias}.${dialect.quoteIdentifierPath([field])} AS ${joinAliases[index]}`
    ),
    ...splitProjection(primaryKeyProjection.sql),
  ];
  return {
    sql: expressions.join(',\n'),
    aliases: [...joinAliases, ...primaryKeyProjection.aliases],
  };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Data Quality numeric parameters must be finite and non-negative');
  }
  return String(value);
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function renderCheckHeader(
  rule: DataQualityRuleConfig,
  details: string[] = [],
  exampleLimit: number
): string {
  const exampleLabel = `${exampleLimit} ${exampleLimit === 1 ? 'example row' : 'example rows'}`;
  const sampleLabel = `${exampleLimit} ${exampleLimit === 1 ? 'sample row' : 'sample rows'}`;
  const resultDescription =
    rule.category === DataQualityCategory.TYPE_MISMATCH
      ? `Returns the runtime type and up to ${sampleLabel}.`
      : exampleLimit > 0
        ? `Returns the full violation count and up to ${exampleLabel}.`
        : 'Returns the full violation count.';
  return [
    `Data Quality check: ${dataQualityCategoryTitle(rule.category)}`,
    ...details,
    resultDescription,
  ]
    .flatMap(renderSqlComment)
    .join('\n');
}

function renderSqlComment(value: string): string[] {
  const normalized = value.replace(/\r\n?|\u2028|\u2029/g, '\n');
  const sanitized = Array.from(normalized, character => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isControlCharacter = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    return isControlCharacter && character !== '\n' ? ' ' : character;
  }).join('');
  return sanitized.split('\n').map(line => `-- ${line}`);
}

function dataQualityCategoryTitle(category: DataQualityCategory): string {
  switch (category) {
    case DataQualityCategory.EMPTY_TABLE:
      return 'Empty table';
    case DataQualityCategory.PK_UNIQUENESS:
      return 'Primary key uniqueness';
    case DataQualityCategory.DUPLICATE_ROWS:
      return 'Duplicate rows';
    case DataQualityCategory.NULL_RATE:
      return 'Null rate';
    case DataQualityCategory.COLUMN_UNIQUENESS:
      return 'Column uniqueness';
    case DataQualityCategory.CONSTANT_COLUMN:
      return 'Constant column';
    case DataQualityCategory.TYPE_MISMATCH:
      return 'Type mismatch';
    case DataQualityCategory.DATA_FRESHNESS:
      return 'Data freshness';
    case DataQualityCategory.NEGATIVE_VALUES:
      return 'Negative values';
    case DataQualityCategory.RELATIONSHIP_INTEGRITY:
      return 'Relationship integrity';
    case DataQualityCategory.REVERSE_RELATIONSHIP:
      return 'Reverse relationship';
  }
}

interface DataQualityCte {
  name: string;
  body: string;
}

interface DataQualityExampleQuery {
  columns: string[];
  aliases: string[];
  from: string;
  joins?: string[];
  where?: string[];
  dialect: DataQualitySqlDialect;
  limit?: number;
}

interface DataQualityUnifiedResultInput {
  rule: DataQualityRuleConfig;
  sourceSql: string;
  targetSql?: string;
  headerDetails?: string[];
  ctes: DataQualityCte[];
  summaryColumns: string[];
  examples?: DataQualityExampleQuery;
}

function renderUnifiedResult(input: DataQualityUnifiedResultInput): string {
  const exampleLimit = input.examples?.limit ?? (input.examples ? 3 : 0);
  const ctes: DataQualityCte[] = [
    { name: 'dq_source', body: input.sourceSql },
    ...(input.targetSql ? [{ name: 'dq_target', body: input.targetSql }] : []),
    ...input.ctes,
  ];
  if (input.examples) {
    ctes.push({
      name: 'dq_examples',
      body: input.examples.dialect.limit(
        renderSelect(['1 AS example_available', ...input.examples.columns], input.examples.from, {
          joins: input.examples.joins,
          where: input.examples.where,
        }),
        exampleLimit
      ),
    });
  }

  const finalColumns = [
    ...input.summaryColumns.map(column => `summary.${column}`),
    ...(input.examples
      ? ['example.example_available', ...input.examples.aliases.map(alias => `example.${alias}`)]
      : ['NULL AS example_available']),
  ];
  const finalQuery = renderSelect(finalColumns, 'dq_summary AS summary', {
    joins: input.examples ? ['LEFT JOIN dq_examples AS example\n  ON TRUE'] : undefined,
  });
  return [
    renderCheckHeader(input.rule, input.headerDetails, exampleLimit),
    renderWithCtes(ctes),
    finalQuery,
  ].join('\n\n');
}

interface RenderSelectOptions {
  joins?: string[];
  where?: string[];
  groupBy?: string[];
  having?: string[];
}

function renderSelect(columns: string[], from?: string, options: RenderSelectOptions = {}): string {
  const lines = ['SELECT', renderSelectColumns(columns)];
  if (from) lines.push(`FROM ${from}`);
  for (const join of options.joins ?? []) lines.push(join);
  if (options.where?.length) {
    lines.push('WHERE', renderPredicateList(options.where));
  }
  if (options.groupBy?.length) {
    lines.push('GROUP BY', renderList(options.groupBy));
  }
  if (options.having?.length) {
    lines.push('HAVING', renderPredicateList(options.having));
  }
  return lines.join('\n');
}

function renderSelectColumns(columns: string[]): string {
  if (columns.length === 0) throw new Error('Data Quality SELECT must contain a column');
  return columns
    .map((column, index) => {
      const rendered = indentContinuation(column, 2);
      return index < columns.length - 1 ? `${rendered},` : rendered;
    })
    .join('\n');
}

function renderList(values: string[]): string {
  return values
    .map((value, index) => {
      const rendered = indentContinuation(value, 2);
      return index < values.length - 1 ? `${rendered},` : rendered;
    })
    .join('\n');
}

function renderPredicateList(predicates: string[]): string {
  return predicates
    .map((predicate, index) => {
      const rendered = indentContinuation(predicate, 2);
      return index === 0 ? rendered : `  AND ${rendered.trimStart()}`;
    })
    .join('\n');
}

function renderJoinOn(join: string, condition: string): string {
  const [firstLine, ...continuation] = condition.split('\n');
  if (!firstLine) throw new Error('Data Quality JOIN condition must not be empty');
  return [join, `  ON ${firstLine}`, ...continuation.map(line => `  ${line}`)].join('\n');
}

interface DataQualityCaseBranch {
  condition: string;
  result: string;
}

function renderCase(branches: DataQualityCaseBranch[], elseValue: string, alias: string): string {
  const lines = ['CASE'];
  for (const branch of branches) {
    const inline = `WHEN ${branch.condition} THEN ${branch.result}`;
    if (!branch.condition.includes('\n') && inline.length <= 80) {
      lines.push(`  ${inline}`);
      continue;
    }
    lines.push('  WHEN');
    lines.push(indentContinuation(branch.condition, 4));
    lines.push(`    THEN ${branch.result}`);
  }
  lines.push(`  ELSE ${elseValue}`, `END AS ${alias}`);
  return lines.join('\n');
}

function renderWithCtes(ctes: DataQualityCte[]): string {
  return [
    'WITH',
    ctes
      .map(cte => `  ${cte.name} AS (\n${indentContinuation(ensureSourceSql(cte.body), 4)}\n  )`)
      .join(',\n\n'),
  ].join('\n');
}

function splitProjection(projection: string): string[] {
  return projection
    .split(',\n')
    .map(value => value.trim())
    .filter(Boolean);
}

function primaryKeyAliasMappings(
  fields: DataQualityFieldDescriptor[],
  excludedFieldPath?: readonly string[]
): string[] {
  return fields
    .filter(
      field =>
        field.isPrimaryKey &&
        !field.requiresFlattening &&
        (!excludedFieldPath || fieldPathKey(field.path) !== fieldPathKey(excludedFieldPath))
    )
    .map((field, index) => `primary_key_value_${index + 1} = ${displayFieldPath(field.path)}`);
}

function fieldAliasMappings(
  field: DataQualityFieldDescriptor,
  fields: DataQualityFieldDescriptor[],
  valueAlias: string
): string[] {
  return [
    `${valueAlias} = ${displayFieldPath(field.path)}`,
    ...primaryKeyAliasMappings(fields, field.path),
  ];
}

function normalizeGroupingType(
  dialect: DataQualitySqlDialect,
  field: Pick<DataQualityFieldDescriptor, 'type' | 'mode'>
): DataQualityCanonicalType | null {
  if (
    (dialect.type === DataStorageType.GOOGLE_BIGQUERY ||
      dialect.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) &&
    field.mode?.toUpperCase() === 'REPEATED'
  ) {
    return DataQualityCanonicalType.COMPLEX;
  }
  return dialect.normalizeType(field.type);
}

function fieldPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function displayFieldPath(path: readonly string[]): string {
  return path.join('.');
}

function indentContinuation(sql: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return sql
    .split('\n')
    .map(line => `${indentation}${line}`)
    .join('\n');
}
