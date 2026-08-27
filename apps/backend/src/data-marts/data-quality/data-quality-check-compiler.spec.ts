import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataQualityRuleConfig,
  EffectiveDataQualityRuleConfig,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import {
  DataQualityCompiledCheck,
  createDataQualityCheckCompiler,
} from './data-quality-check-compiler';

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

describe('DataQualityCheckCompiler', () => {
  const storageTypes = Object.values(DataStorageType);
  const sourceQuery = 'SELECT * FROM analytics.source_table';
  const targetQuery = 'SELECT * FROM analytics.target_table';

  const typeNames: Record<
    DataStorageType,
    { string: string; integer: string; timestamp: string; date: string; complex: string }
  > = {
    [DataStorageType.GOOGLE_BIGQUERY]: {
      string: 'STRING',
      integer: 'INTEGER',
      timestamp: 'TIMESTAMP',
      date: 'DATE',
      complex: 'RECORD',
    },
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: {
      string: 'STRING',
      integer: 'INTEGER',
      timestamp: 'TIMESTAMP',
      date: 'DATE',
      complex: 'RECORD',
    },
    [DataStorageType.AWS_ATHENA]: {
      string: 'STRING',
      integer: 'BIGINT',
      timestamp: 'TIMESTAMP WITH TIME ZONE',
      date: 'DATE',
      complex: 'MAP',
    },
    [DataStorageType.SNOWFLAKE]: {
      string: 'STRING',
      integer: 'INTEGER',
      timestamp: 'TIMESTAMP',
      date: 'DATE',
      complex: 'VARIANT',
    },
    [DataStorageType.AWS_REDSHIFT]: {
      string: 'VARCHAR',
      integer: 'BIGINT',
      timestamp: 'TIMESTAMPTZ',
      date: 'DATE',
      complex: 'SUPER',
    },
    [DataStorageType.DATABRICKS]: {
      string: 'STRING',
      integer: 'BIGINT',
      timestamp: 'TIMESTAMP',
      date: 'DATE',
      complex: 'MAP',
    },
  };

  function schema(storageType: DataStorageType, options: { primaryKey?: boolean } = {}) {
    const types = typeNames[storageType];
    const field = (
      name: string,
      type: string,
      extra: Record<string, unknown> = {}
    ): Record<string, unknown> => ({
      name,
      type,
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: false,
      isHiddenForReporting: false,
      ...(storageType === DataStorageType.GOOGLE_BIGQUERY ||
      storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY
        ? { mode: 'NULLABLE' }
        : {}),
      ...extra,
    });
    const fields = [
      field('id', types.string, {
        isPrimaryKey: options.primaryKey ?? true,
        isHiddenForReporting: true,
      }),
      field('tenant_id', types.string, { isPrimaryKey: options.primaryKey ?? true }),
      field('customer_id', types.string),
      field('amount', types.integer),
      field('updated_at', types.timestamp),
      field('event_date', types.date),
      field('payload', types.complex),
      field('secret', types.string, { isHiddenForReporting: true }),
    ];
    const schemaType =
      storageType === DataStorageType.GOOGLE_BIGQUERY ||
      storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY
        ? 'bigquery-data-mart-schema'
        : storageType === DataStorageType.AWS_ATHENA
          ? 'athena-data-mart-schema'
          : storageType === DataStorageType.SNOWFLAKE
            ? 'snowflake-data-mart-schema'
            : storageType === DataStorageType.AWS_REDSHIFT
              ? 'redshift-data-mart-schema'
              : 'databricks-data-mart-schema';
    return {
      type: schemaType,
      ...(storageType === DataStorageType.DATABRICKS ? { table: 'analytics.source_table' } : {}),
      fields,
    } as unknown as DataMartSchema;
  }

  function schemaWithFieldType(
    storageType: DataStorageType,
    fieldName: string,
    type: string,
    mode?: string
  ): DataMartSchema {
    const result = schema(storageType) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    const field = result.fields.find(candidate => candidate.name === fieldName);
    if (!field) throw new Error(`Missing test field ${fieldName}`);
    field.type = type;
    if (mode !== undefined) field.mode = mode;
    return result as unknown as DataMartSchema;
  }

  const relationship: DataQualityRelationshipSnapshot = {
    id: 'rel-1',
    sourceDataMartId: 'source-dm',
    targetDataMartId: 'target-dm',
    targetAlias: 'customers',
    joinConditions: [
      { sourceFieldName: 'tenant_id', targetFieldName: 'tenant_id' },
      { sourceFieldName: 'customer_id', targetFieldName: 'id' },
    ],
  };

  function rule(
    category: DataQualityCategory,
    scope:
      | { type: DataQualityScope.DATA_MART }
      | { type: DataQualityScope.FIELD; fieldPath: string[] }
      | { type: DataQualityScope.RELATIONSHIP; relationshipId: string },
    parameters: EffectiveDataQualityRuleConfig['parameters'] = {}
  ): EffectiveDataQualityRuleConfig {
    const suffix =
      scope.type === DataQualityScope.DATA_MART
        ? 'data_mart'
        : scope.type === DataQualityScope.FIELD
          ? `field:${JSON.stringify(scope.fieldPath)}`
          : `relationship:${scope.relationshipId}`;
    return {
      key: `${category}:${suffix}`,
      category,
      scope,
      severity: DataQualitySeverity.WARNING,
      enabled: true,
      isApplicable: true,
      parameters,
    };
  }

  const tableRule = (category: DataQualityCategory) =>
    rule(category, { type: DataQualityScope.DATA_MART });
  const fieldRule = (
    category: DataQualityCategory,
    fieldPath: string | string[],
    parameters: EffectiveDataQualityRuleConfig['parameters'] = {}
  ) =>
    rule(
      category,
      {
        type: DataQualityScope.FIELD,
        fieldPath: typeof fieldPath === 'string' ? [fieldPath] : fieldPath,
      },
      parameters
    );
  const relationshipRule = (category: DataQualityCategory) =>
    rule(category, { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' });

  const allCategoryInputs = (storageType: DataStorageType) => {
    const base = {
      storageType,
      sourceQuery,
      schema: schema(storageType),
    };
    const relationshipContext = {
      snapshot: relationship,
      targetSourceQuery: targetQuery,
      targetSchema: schema(storageType),
      targetStorageType: storageType,
      sourceConnectionId: 'connection-1',
      targetConnectionId: 'connection-1',
    };
    const freshnessInput =
      storageType === DataStorageType.SNOWFLAKE
        ? []
        : [
            {
              ...base,
              rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
                thresholdHours: 24,
              }),
            },
          ];
    return [
      { ...base, rule: tableRule(DataQualityCategory.EMPTY_TABLE) },
      { ...base, rule: tableRule(DataQualityCategory.PK_UNIQUENESS) },
      { ...base, rule: tableRule(DataQualityCategory.DUPLICATE_ROWS) },
      {
        ...base,
        rule: fieldRule(DataQualityCategory.NULL_RATE, 'amount', { thresholdPercent: 5 }),
      },
      { ...base, rule: fieldRule(DataQualityCategory.COLUMN_UNIQUENESS, 'customer_id') },
      { ...base, rule: fieldRule(DataQualityCategory.CONSTANT_COLUMN, 'secret') },
      { ...base, rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount') },
      ...freshnessInput,
      { ...base, rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount') },
      {
        ...base,
        rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
        relationship: relationshipContext,
      },
      {
        ...base,
        rule: relationshipRule(DataQualityCategory.REVERSE_RELATIONSHIP),
        relationship: relationshipContext,
      },
    ];
  };

  const sql = (plan: DataQualityCompiledCheck) => {
    if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);
    return plan.sql;
  };

  it('requests only the source columns used by each check family', async () => {
    const compiler = createDataQualityCheckCompiler();
    const cases = [
      {
        rule: tableRule(DataQualityCategory.EMPTY_TABLE),
        expectedColumns: ['`id`'],
      },
      {
        rule: tableRule(DataQualityCategory.PK_UNIQUENESS),
        expectedColumns: ['`id`', '`tenant_id`'],
      },
      {
        rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount'),
        expectedColumns: ['`amount`', '`id`', '`tenant_id`'],
      },
      {
        rule: tableRule(DataQualityCategory.DUPLICATE_ROWS),
        expectedColumns: [],
      },
    ];

    for (const testCase of cases) {
      const resolveSourceQuery = jest.fn(async (_columns?: string[]) => sourceQuery);
      const input = {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        resolveSourceQuery,
        schema: schema(DataStorageType.GOOGLE_BIGQUERY),
        rule: testCase.rule,
      };

      await compiler.compile(input);

      expect(resolveSourceQuery).toHaveBeenCalledWith(testCase.expectedColumns);
    }
  });

  it.each([
    {
      category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
      sourceColumns: ['`customer_id`', '`id`', '`tenant_id`'],
      targetColumns: ['`id`'],
    },
    {
      category: DataQualityCategory.REVERSE_RELATIONSHIP,
      sourceColumns: ['`customer_id`'],
      targetColumns: ['`id`', '`tenant_id`'],
    },
  ])(
    'requests only relationship columns for $category',
    async ({ category, sourceColumns, targetColumns }) => {
      const compiler = createDataQualityCheckCompiler();
      const resolveSourceQuery = jest.fn(async (_columns?: string[]) => sourceQuery);
      const resolveTargetSourceQuery = jest.fn(async (_columns?: string[]) => targetQuery);
      const singleJoinRelationship = {
        ...relationship,
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      };
      const input = {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        resolveSourceQuery,
        schema: schema(DataStorageType.GOOGLE_BIGQUERY),
        rule: relationshipRule(category),
        relationship: {
          snapshot: singleJoinRelationship,
          resolveTargetSourceQuery,
          targetSchema: schema(DataStorageType.GOOGLE_BIGQUERY),
          targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
          sourceConnectionId: 'connection-1',
          targetConnectionId: 'connection-1',
        },
      };

      await compiler.compile(input);

      expect(resolveSourceQuery).toHaveBeenCalledWith(sourceColumns);
      expect(resolveTargetSourceQuery).toHaveBeenCalledWith(targetColumns);
    }
  );

  it('does not copy whole rows into violation CTEs', async () => {
    const compiler = createDataQualityCheckCompiler();
    const negative = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount'),
    });
    const relationshipPlan = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
      relationship: {
        snapshot: relationship,
        targetSourceQuery: targetQuery,
        targetSchema: schema(DataStorageType.GOOGLE_BIGQUERY),
        targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
      },
    });

    expect(sql(negative)).not.toMatch(/SELECT\s+\*\s+FROM dq_source/);
    expect(sql(relationshipPlan)).not.toMatch(/SELECT\s+\w+\.\*\s+FROM dq_source/);
  });

  it('keeps a literal dotted field distinct from a segmented nested field', async () => {
    const nestedSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'customer.id',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
        {
          name: 'customer',
          type: 'RECORD',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          fields: [
            {
              name: 'id',
              type: 'STRING',
              mode: 'NULLABLE',
              status: DataMartSchemaFieldStatus.CONNECTED,
              isPrimaryKey: false,
              isHiddenForReporting: false,
            },
          ],
        },
      ],
    } as DataMartSchema;
    const compiler = createDataQualityCheckCompiler();
    const resolveLiteralSourceQuery = jest.fn(async (_columns?: string[]) => sourceQuery);
    const resolveNestedSourceQuery = jest.fn(async (_columns?: string[]) => sourceQuery);

    const literalInput = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      resolveSourceQuery: resolveLiteralSourceQuery,
      schema: nestedSchema,
      rule: fieldRule(DataQualityCategory.NULL_RATE, ['customer.id'], {
        thresholdPercent: 0,
      }),
    };
    const nestedInput = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      resolveSourceQuery: resolveNestedSourceQuery,
      schema: nestedSchema,
      rule: fieldRule(DataQualityCategory.NULL_RATE, ['customer', 'id'], {
        thresholdPercent: 0,
      }),
    };

    const literal = await compiler.compile(literalInput);
    const nested = await compiler.compile(nestedInput);

    expect(sql(literal)).toContain('`customer.id`');
    expect(sql(literal)).not.toContain('`customer`.`id`');
    expect(sql(nested)).toContain('`customer`.`id`');
    expect(resolveLiteralSourceQuery).toHaveBeenCalledWith(['`customer.id`']);
    expect(resolveNestedSourceQuery).toHaveBeenCalledWith(['`customer`']);
  });

  it('quotes a dotted relationship join field as one physical identifier', async () => {
    const sourceSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    const targetSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    sourceSchema.fields[2].name = 'customer.id';
    targetSchema.fields[0].name = 'customer.id';
    const dottedRelationship = {
      ...relationship,
      joinConditions: [{ sourceFieldName: 'customer.id', targetFieldName: 'customer.id' }],
    };
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: sourceSchema as unknown as DataMartSchema,
      rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
      relationship: {
        snapshot: dottedRelationship,
        targetSourceQuery: targetQuery,
        targetSchema: targetSchema as unknown as DataMartSchema,
        targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
      },
    });

    expect(sql(plan)).toContain('source.`customer.id` = target.`customer.id`');
    expect(sql(plan)).not.toContain('`customer`.`id`');
  });

  it.each([DataQualityCategory.RELATIONSHIP_INTEGRITY, DataQualityCategory.REVERSE_RELATIONSHIP])(
    'avoids range aliases shadowed by relationship columns for %s',
    async category => {
      const sourceSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
        fields: Array<Record<string, unknown>>;
      };
      const targetSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
        fields: Array<Record<string, unknown>>;
      };
      sourceSchema.fields.push({
        name: 'target',
        type: 'STRING',
        mode: 'NULLABLE',
        status: DataMartSchemaFieldStatus.CONNECTED,
        isPrimaryKey: false,
        isHiddenForReporting: false,
      });
      targetSchema.fields.push({
        name: 'source',
        type: 'STRING',
        mode: 'NULLABLE',
        status: DataMartSchemaFieldStatus.CONNECTED,
        isPrimaryKey: false,
        isHiddenForReporting: false,
      });
      const plan = await createDataQualityCheckCompiler().compile({
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        schema: sourceSchema as unknown as DataMartSchema,
        rule: relationshipRule(category),
        relationship: {
          snapshot: relationship,
          targetSourceQuery: targetQuery,
          targetSchema: targetSchema as unknown as DataMartSchema,
          targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
          sourceConnectionId: 'connection-1',
          targetConnectionId: 'connection-1',
        },
      });
      const measurement = sql(plan);

      expect(measurement).toContain('FROM dq_source AS dq_row_source');
      expect(measurement).toContain('FROM dq_target AS dq_row_target');
      expect(measurement).toContain('dq_row_source.`tenant_id` = dq_row_target.`tenant_id`');
      expect(measurement).toContain('dq_row_source.`customer_id` = dq_row_target.`id`');
    }
  );

  it('keeps every generated header line commented when details contain control characters', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
      relationship: {
        snapshot: {
          ...relationship,
          targetAlias: 'customers\r\nSELECT 1;\u0000DROP TABLE audit\u0085DELETE FROM audit_log',
        },
        targetSourceQuery: targetQuery,
        targetSchema: schema(DataStorageType.GOOGLE_BIGQUERY),
        targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
      },
    });
    const headerLines = sql(plan).split('\n\n', 1)[0].split('\n');

    expect(headerLines.every(line => line.startsWith('-- '))).toBe(true);
    expect(headerLines).toContain('-- SELECT 1; DROP TABLE audit DELETE FROM audit_log');
    expect(sql(plan)).not.toContain('\u0085');
  });

  it.each(storageTypes)(
    'uses one readable result query and category aliases for every check available on %s',
    async storageType => {
      const compiler = createDataQualityCheckCompiler();
      const plans = await Promise.all(
        allCategoryInputs(storageType).map(input => compiler.compile(input))
      );
      const expectedAliases: Partial<Record<DataQualityCategory, string[]>> = {
        [DataQualityCategory.EMPTY_TABLE]: [],
        [DataQualityCategory.PK_UNIQUENESS]: [
          'primary_key_value_1',
          'primary_key_value_2',
          'duplicate_row_count',
          'extra_row_count',
        ],
        [DataQualityCategory.DUPLICATE_ROWS]: [
          ...Array.from({ length: 8 }, (_, index) => `duplicate_value_${index + 1}`),
          'duplicate_row_count',
          'extra_row_count',
        ],
        [DataQualityCategory.NULL_RATE]: [
          'null_value',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.COLUMN_UNIQUENESS]: [
          'duplicate_value',
          'duplicate_row_count',
          'duplicate_occurrence_number',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.CONSTANT_COLUMN]: [
          'constant_value',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.TYPE_MISMATCH]: [
          'sample_value',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.DATA_FRESHNESS]: [
          'latest_value',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.NEGATIVE_VALUES]: [
          'negative_value',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.RELATIONSHIP_INTEGRITY]: [
          'source_join_value_1',
          'source_join_value_2',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
        [DataQualityCategory.REVERSE_RELATIONSHIP]: [
          'target_join_value_1',
          'target_join_value_2',
          'primary_key_value_1',
          'primary_key_value_2',
        ],
      };

      for (const plan of plans) {
        if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);
        expect(plan.sql).toContain('-- Data Quality check:');
        expect(plan.resultShape.exampleColumns).toEqual(expectedAliases[plan.category]);
        if (plan.strategy === 'COUNT') {
          expect(plan.sql).toContain('AS violation_count');
        }
      }
    }
  );

  it.each(storageTypes)('matches the available SQL contract snapshot for %s', async storageType => {
    const compiler = createDataQualityCheckCompiler();
    const plans = await Promise.all(
      allCategoryInputs(storageType).map(input => compiler.compile(input))
    );

    expect(
      plans.map(plan =>
        plan.kind === 'EXECUTABLE'
          ? {
              category: plan.category,
              strategy: plan.strategy,
              sql: plan.sql,
              resultShape: plan.resultShape,
            }
          : plan
      )
    ).toMatchSnapshot();
  });

  it('implements composite PK null exclusion and counts only rows beyond the first', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: tableRule(DataQualityCategory.PK_UNIQUENESS),
    });
    const measurement = sql(plan);

    expect(measurement).toContain('`id` IS NOT NULL');
    expect(measurement).toContain('`tenant_id` IS NOT NULL');
    expect(measurement).toMatch(/COUNT\(\*\)\s*-\s*1/i);
  });

  it('uses every connected materialized field including hidden and canonicalizes complex values', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: tableRule(DataQualityCategory.DUPLICATE_ROWS),
    });
    const measurement = sql(plan);

    expect(measurement).toContain('`secret`');
    expect(measurement).toContain('TO_JSON_STRING(`payload`)');
  });

  it('DUPLICATE_ROWS groups by physical fields only, excluding a calculated field', async () => {
    const withCalculated = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    withCalculated.fields.push({
      name: 'ctr',
      type: 'FLOAT',
      mode: 'NULLABLE',
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: false,
      isHiddenForReporting: false,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
    });

    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: withCalculated as unknown as DataMartSchema,
      rule: tableRule(DataQualityCategory.DUPLICATE_ROWS),
    });
    const measurement = sql(plan);

    expect(measurement).not.toContain('`ctr`');
  });

  it('resolves no field for a FIELD-scoped rule targeting a calculated field', async () => {
    const withCalculated = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    withCalculated.fields.push({
      name: 'ctr',
      type: 'FLOAT',
      mode: 'NULLABLE',
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: false,
      isHiddenForReporting: false,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
    });

    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: withCalculated as unknown as DataMartSchema,
      rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'ctr'),
    });

    expect(plan).toMatchObject({
      kind: 'NOT_APPLICABLE',
      reason: 'The field is missing from the Output Schema',
    });
  });

  it('returns not applicable when any duplicate-row field cannot be grouped safely', async () => {
    const unsupported = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    unsupported.fields.push({
      name: 'duration',
      type: 'INTERVAL',
      mode: 'NULLABLE',
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: false,
      isHiddenForReporting: true,
    });

    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: unsupported as unknown as DataMartSchema,
      rule: tableRule(DataQualityCategory.DUPLICATE_ROWS),
    });

    expect(plan).toMatchObject({ kind: 'NOT_APPLICABLE' });
  });

  it('keeps empty-source semantics in warehouse SQL for null-rate, constant, and freshness', async () => {
    const compiler = createDataQualityCheckCompiler();
    const base = {
      storageType: DataStorageType.AWS_REDSHIFT,
      sourceQuery,
      schema: schema(DataStorageType.AWS_REDSHIFT),
    };
    const plans = await Promise.all([
      compiler.compile({
        ...base,
        rule: fieldRule(DataQualityCategory.NULL_RATE, 'amount', { thresholdPercent: 0 }),
      }),
      compiler.compile({
        ...base,
        rule: fieldRule(DataQualityCategory.CONSTANT_COLUMN, 'secret'),
      }),
      compiler.compile({
        ...base,
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      }),
    ]);

    for (const plan of plans) {
      expect(sql(plan)).toContain('is_applicable');
    }
  });

  it('introspects type independently of row presence and samples only non-null values', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.SNOWFLAKE,
      sourceQuery: 'SELECT CAST(NULL AS NUMBER(38,0)) AS amount WHERE 1 = 0',
      schema: schema(DataStorageType.SNOWFLAKE),
      rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
    });

    expect(sql(plan)).toContain('SYSTEM$TYPEOF');
    expect(sql(plan)).toMatch(/IS NOT NULL[\s\S]*LIMIT 1/i);
  });

  it.each(storageTypes)(
    'makes type-mismatch reproduction executable on an empty source for %s',
    async storageType => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery: 'SELECT * FROM analytics.source_table WHERE 1 = 0',
        schema: schema(storageType),
        rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
      });
      if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);

      expect(plan.sql).toContain('Expected Output Schema type:');
      expect(plan.sql).toMatch(/\bLIMIT 1\b/i);
    }
  );

  it('retains BigQuery field mode in the type-mismatch execution contract', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schemaWithFieldType(DataStorageType.GOOGLE_BIGQUERY, 'amount', 'INTEGER', 'REPEATED'),
      rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
    });

    expect(plan).toMatchObject({
      kind: 'EXECUTABLE',
      expectedNativeType: 'INTEGER',
      expectedMode: 'REPEATED',
    });
  });

  it('marks scalar checks on a top-level BigQuery REPEATED field not applicable while keeping type mismatch executable', async () => {
    const repeatedSchema = schemaWithFieldType(
      DataStorageType.GOOGLE_BIGQUERY,
      'amount',
      'INTEGER',
      'REPEATED'
    );
    const compiler = createDataQualityCheckCompiler();

    const scalarPlan = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: repeatedSchema,
      rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount'),
    });
    const typePlan = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: repeatedSchema,
      rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
    });

    expect(scalarPlan).toMatchObject({
      kind: 'NOT_APPLICABLE',
      reason: expect.stringContaining('flattening'),
    });
    expect(typePlan).toMatchObject({
      kind: 'EXECUTABLE',
      expectedMode: 'REPEATED',
    });
  });

  it.each([
    [
      DataStorageType.GOOGLE_BIGQUERY,
      {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'items',
            type: 'RECORD',
            mode: 'REPEATED',
            status: DataMartSchemaFieldStatus.CONNECTED,
            isPrimaryKey: false,
            isHiddenForReporting: false,
            fields: [
              {
                name: 'amount',
                type: 'INTEGER',
                mode: 'NULLABLE',
                status: DataMartSchemaFieldStatus.CONNECTED,
                isPrimaryKey: false,
                isHiddenForReporting: false,
              },
            ],
          },
        ],
      },
    ],
    [
      DataStorageType.SNOWFLAKE,
      {
        type: 'snowflake-data-mart-schema',
        fields: [
          {
            name: 'items',
            type: 'VARIANT',
            status: DataMartSchemaFieldStatus.CONNECTED,
            isPrimaryKey: false,
            isHiddenForReporting: false,
            fields: [
              {
                name: 'amount',
                type: 'INTEGER',
                status: DataMartSchemaFieldStatus.CONNECTED,
                isPrimaryKey: false,
                isHiddenForReporting: false,
              },
            ],
          },
        ],
      },
    ],
  ])(
    'rejects a stale enabled field rule below a collection container for %s',
    async (storageType, outputSchema) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery,
        schema: outputSchema as DataMartSchema,
        rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, ['items', 'amount']),
      });

      expect(plan).toMatchObject({
        kind: 'NOT_APPLICABLE',
        reason: expect.stringContaining('flattening'),
      });
    }
  );

  it('rejects PK uniqueness when a nested primary key requires flattening', async () => {
    const outputSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'items',
          type: 'RECORD',
          mode: 'REPEATED',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          fields: [
            {
              name: 'id',
              type: 'INTEGER',
              mode: 'NULLABLE',
              status: DataMartSchemaFieldStatus.CONNECTED,
              isPrimaryKey: true,
              isHiddenForReporting: false,
            },
          ],
        },
      ],
    } as DataMartSchema;

    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: outputSchema,
      rule: tableRule(DataQualityCategory.PK_UNIQUENESS),
    });

    expect(plan).toMatchObject({
      kind: 'NOT_APPLICABLE',
      reason: expect.stringContaining('flattening'),
    });
  });

  it.each(['source', 'target'] as const)(
    'rejects relationship integrity when the %s join field requires flattening',
    async unsafeSide => {
      const repeatedSchema = (childName: string): DataMartSchema =>
        ({
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: childName,
              type: 'STRING',
              mode: 'REPEATED',
              status: DataMartSchemaFieldStatus.CONNECTED,
              isPrimaryKey: false,
              isHiddenForReporting: false,
            },
          ],
        }) as DataMartSchema;
      const snapshot: DataQualityRelationshipSnapshot = {
        ...relationship,
        joinConditions: [
          {
            sourceFieldName: 'customer_id',
            targetFieldName: 'id',
          },
        ],
      };

      const plan = await createDataQualityCheckCompiler().compile({
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        schema:
          unsafeSide === 'source'
            ? repeatedSchema('customer_id')
            : schema(DataStorageType.GOOGLE_BIGQUERY),
        rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
        relationship: {
          snapshot,
          targetSourceQuery: targetQuery,
          targetSchema:
            unsafeSide === 'target'
              ? repeatedSchema('id')
              : schema(DataStorageType.GOOGLE_BIGQUERY),
          targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
          sourceConnectionId: 'connection-1',
          targetConnectionId: 'connection-1',
        },
      });

      expect(plan).toMatchObject({
        kind: 'NOT_APPLICABLE',
        reason: expect.stringContaining('flattening'),
      });
    }
  );

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'GEOGRAPHY', DataQualityCategory.DUPLICATE_ROWS],
    [DataStorageType.AWS_REDSHIFT, 'GEOMETRY', DataQualityCategory.CONSTANT_COLUMN],
  ])(
    'marks unsafe spatial grouping not applicable for %s %s',
    async (storageType, spatialType, category) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery,
        schema: schemaWithFieldType(storageType, 'payload', spatialType),
        rule:
          category === DataQualityCategory.DUPLICATE_ROWS
            ? tableRule(category)
            : fieldRule(category, 'payload'),
      });

      expect(plan).toMatchObject({ kind: 'NOT_APPLICABLE' });
    }
  );

  it.each([
    [
      DataStorageType.GOOGLE_BIGQUERY,
      'TIMESTAMP',
      'latest_observed_timestamp',
      'CURRENT_TIMESTAMP()',
    ],
    [
      DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      'TIMESTAMP',
      'latest_observed_timestamp',
      'CURRENT_TIMESTAMP()',
    ],
    [
      DataStorageType.AWS_ATHENA,
      'TIMESTAMP WITH TIME ZONE',
      'latest_observed_timestamp',
      'current_timestamp',
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      'TIMESTAMPTZ',
      "TIMEZONE('UTC', latest_observed_timestamp)",
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())",
    ],
    [DataStorageType.DATABRICKS, 'TIMESTAMP', 'latest_observed_timestamp', 'current_timestamp()'],
  ])(
    'compares elapsed-time instants for supported %s %s freshness',
    async (storageType, nativeType, expectedValueSql, expectedCurrentSql) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery,
        schema: schemaWithFieldType(storageType, 'updated_at', nativeType),
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      });
      const compiledSql = sql(plan);
      const normalizedSql = normalizeSql(compiledSql);

      expect(normalizedSql).toContain(expectedValueSql);
      expect(normalizedSql).toContain(expectedCurrentSql);
      expect(compiledSql).not.toContain('America/New_York');
    }
  );

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'DATE'],
    [DataStorageType.AWS_ATHENA, 'TIMESTAMP'],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP_TZ'],
    [DataStorageType.AWS_REDSHIFT, 'TIMESTAMP'],
    [DataStorageType.DATABRICKS, 'TIMESTAMP_NTZ'],
  ])('does not compile freshness for unsupported %s %s', async (storageType, nativeType) => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType,
      sourceQuery,
      schema: schemaWithFieldType(storageType, 'updated_at', nativeType),
      rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
        thresholdHours: 24,
      }),
    });

    expect(plan).toMatchObject({
      kind: 'NOT_APPLICABLE',
      reason: expect.stringMatching(/supported|timestamp/i),
    });
  });

  it('uses composite relationship equality and excludes partial-null tuples', async () => {
    const compiler = createDataQualityCheckCompiler();
    const plan = await compiler.compile({
      storageType: DataStorageType.DATABRICKS,
      sourceQuery,
      schema: schema(DataStorageType.DATABRICKS),
      rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
      relationship: {
        snapshot: relationship,
        targetSourceQuery: targetQuery,
        targetSchema: schema(DataStorageType.DATABRICKS),
        targetStorageType: DataStorageType.DATABRICKS,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
      },
    });
    const measurement = sql(plan);

    expect(measurement).toContain('source.`tenant_id` IS NOT NULL');
    expect(measurement).toContain('source.`customer_id` IS NOT NULL');
    expect(measurement).toContain('source.`tenant_id` = target.`tenant_id`');
    expect(measurement).toContain('source.`customer_id` = target.`id`');
    expect(measurement).toContain(
      [
        'WHERE',
        '      source.`tenant_id` IS NOT NULL',
        '      AND source.`customer_id` IS NOT NULL',
      ].join('\n')
    );
    expect(measurement).toContain(
      [
        'WHERE',
        '          source.`tenant_id` = target.`tenant_id`',
        '          AND source.`customer_id` = target.`id`',
      ].join('\n')
    );
  });

  it.each([
    ['different storage', DataStorageType.SNOWFLAKE, 'connection-1'],
    ['different connection', DataStorageType.GOOGLE_BIGQUERY, 'connection-2'],
  ])(
    'marks relationship checks not applicable for %s',
    async (_label, targetStorageType, targetConnectionId) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        schema: schema(DataStorageType.GOOGLE_BIGQUERY),
        rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
        relationship: {
          snapshot: relationship,
          targetSourceQuery: targetQuery,
          targetSchema: schema(targetStorageType as DataStorageType),
          targetStorageType: targetStorageType as DataStorageType,
          sourceConnectionId: 'connection-1',
          targetConnectionId,
        },
      });

      expect(plan.kind).toBe('NOT_APPLICABLE');
    }
  );

  it.each([
    [
      'rule applicability',
      {
        rule: {
          ...relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
          isApplicable: false,
          notApplicableReason: 'Target is unavailable',
        },
        targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
        targetConnectionId: 'connection-1',
      },
    ],
    [
      'storage compatibility',
      {
        rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
        targetStorageType: DataStorageType.SNOWFLAKE,
        targetConnectionId: 'connection-1',
      },
    ],
  ])('does not resolve a relationship target before validating %s', async (_label, overrides) => {
    const resolveTargetSourceQuery = jest.fn().mockResolvedValue(targetQuery);
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: overrides.rule,
      relationship: {
        snapshot: relationship,
        targetSchema: schema(overrides.targetStorageType),
        targetStorageType: overrides.targetStorageType,
        sourceConnectionId: 'connection-1',
        targetConnectionId: overrides.targetConnectionId,
        resolveTargetSourceQuery,
      } as never,
    });

    expect(plan).toMatchObject({ kind: 'NOT_APPLICABLE' });
    expect(resolveTargetSourceQuery).not.toHaveBeenCalled();
  });

  it('validates numeric parameters before composing SQL', async () => {
    const compiler = createDataQualityCheckCompiler();
    const input = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: {
        ...fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
        parameters: { thresholdHours: -1 },
      },
    };

    await expect(compiler.compile(input)).rejects.toThrow(/thresholdHours|greater than or equal/i);
  });

  it('rejects a plain stored rule because compilation requires effective applicability', async () => {
    const storedRule: DataQualityRuleConfig = {
      key: 'empty_table:data_mart',
      category: DataQualityCategory.EMPTY_TABLE,
      scope: { type: DataQualityScope.DATA_MART },
      severity: DataQualitySeverity.ERROR,
      enabled: true,
      parameters: {},
    };

    await expect(
      createDataQualityCheckCompiler().compile({
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        schema: schema(DataStorageType.GOOGLE_BIGQUERY),
        rule: storedRule as EffectiveDataQualityRuleConfig,
      })
    ).rejects.toThrow(/isApplicable|effective/i);
  });

  it('rejects table-scoped data freshness', async () => {
    await expect(
      createDataQualityCheckCompiler().compile({
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        schema: schema(DataStorageType.GOOGLE_BIGQUERY),
        rule: rule(
          DataQualityCategory.DATA_FRESHNESS,
          { type: DataQualityScope.DATA_MART },
          { thresholdHours: 24 }
        ),
      })
    ).rejects.toThrow(/scope/i);
  });

  it('does not compile freshness for BigQuery DATE fields', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'event_date', {
        thresholdHours: 24,
      }),
    });

    expect(plan).toMatchObject({ kind: 'NOT_APPLICABLE' });
  });

  it('does not treat BigQuery DATETIME as an instant timestamp for freshness', async () => {
    const datetimeSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    const updatedAt = datetimeSchema.fields.find(field => field.name === 'updated_at');
    if (updatedAt) updatedAt.type = 'DATETIME';

    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: datetimeSchema as unknown as DataMartSchema,
      rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
        thresholdHours: 24,
      }),
    });

    expect(plan.kind).toBe('NOT_APPLICABLE');
  });

  it('projects only the field value and connected PK locators in every field example query', async () => {
    const compiler = createDataQualityCheckCompiler();
    const base = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
    };
    const inputs = [
      {
        ...base,
        rule: fieldRule(DataQualityCategory.NULL_RATE, 'amount', { thresholdPercent: 0 }),
      },
      { ...base, rule: fieldRule(DataQualityCategory.COLUMN_UNIQUENESS, 'customer_id') },
      { ...base, rule: fieldRule(DataQualityCategory.CONSTANT_COLUMN, 'secret') },
      { ...base, rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount') },
      {
        ...base,
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      },
      { ...base, rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount') },
    ];

    for (const input of inputs) {
      const plan = await compiler.compile(input);
      if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);
      expect(plan.resultShape.exampleColumns).toContain('primary_key_value_1');
      expect(plan.resultShape.exampleColumns).not.toEqual([]);
      expect(plan.sql).not.toMatch(/\bAS dq_(?:value|pk_\d+)\b/i);
      const expectedExampleLimit = [
        DataQualityCategory.CONSTANT_COLUMN,
        DataQualityCategory.TYPE_MISMATCH,
        DataQualityCategory.DATA_FRESHNESS,
      ].includes(input.rule.category)
        ? 1
        : 3;
      expect(plan.sql).toMatch(new RegExp(`\\bLIMIT ${expectedExampleLimit}\\b`, 'i'));
    }
  });

  it('returns only rows beyond the first occurrence as column-uniqueness examples', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      rule: fieldRule(DataQualityCategory.COLUMN_UNIQUENESS, 'customer_id'),
    });

    expect(plan).toMatchObject({
      kind: 'EXECUTABLE',
      resultShape: {
        exampleColumns: expect.arrayContaining(['duplicate_occurrence_number']),
      },
    });
    expect(sql(plan)).toContain('ROW_NUMBER() OVER');
    expect(sql(plan)).toContain('AS duplicate_occurrence_number');
    expect(sql(plan)).toMatch(/duplicate_occurrence_number\s*>\s*1/i);
  });

  it('omits primary-key locators that require flattening from field and relationship examples', async () => {
    const outputSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
      fields: Array<Record<string, unknown>>;
    };
    outputSchema.fields.push({
      name: 'items',
      type: 'RECORD',
      mode: 'REPEATED',
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: false,
      isHiddenForReporting: false,
      fields: [
        {
          name: 'id',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: true,
          isHiddenForReporting: false,
        },
      ],
    });

    const compiler = createDataQualityCheckCompiler();
    const fieldPlan = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: outputSchema as unknown as DataMartSchema,
      rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount'),
    });
    const relationshipPlan = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: outputSchema as unknown as DataMartSchema,
      rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
      relationship: {
        snapshot: relationship,
        targetSourceQuery: targetQuery,
        targetSchema: schema(DataStorageType.GOOGLE_BIGQUERY),
        targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
      },
    });

    for (const plan of [fieldPlan, relationshipPlan]) {
      const examples = sql(plan);
      expect(examples).not.toContain('primary_key_value_3');
      expect(examples).not.toMatch(/`items`\.`id`/);
    }
  });
});
