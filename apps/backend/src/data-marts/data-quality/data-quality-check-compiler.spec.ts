import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataQualityRuleConfig,
  EffectiveDataQualityRuleConfig,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import {
  DataQualityCompiledCheck,
  DataQualityQueryPurpose,
  createDataQualityCheckCompiler,
} from './data-quality-check-compiler';

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
      timestamp: 'TIMESTAMP',
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
      timestamp: 'TIMESTAMP',
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
      | { type: DataQualityScope.FIELD; fieldId: string }
      | { type: DataQualityScope.RELATIONSHIP; relationshipId: string },
    parameters: EffectiveDataQualityRuleConfig['parameters'] = {}
  ): EffectiveDataQualityRuleConfig {
    const suffix =
      scope.type === DataQualityScope.DATA_MART
        ? 'data_mart'
        : scope.type === DataQualityScope.FIELD
          ? `field:${scope.fieldId}`
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
    fieldId: string,
    parameters: EffectiveDataQualityRuleConfig['parameters'] = {}
  ) => rule(category, { type: DataQualityScope.FIELD, fieldId }, parameters);
  const relationshipRule = (category: DataQualityCategory) =>
    rule(category, { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' });

  const allCategoryInputs = (storageType: DataStorageType) => {
    const base = {
      storageType,
      sourceQuery,
      schema: schema(storageType),
      timezone: 'Europe/Kyiv',
    };
    const relationshipContext = {
      snapshot: relationship,
      targetSourceQuery: targetQuery,
      targetSchema: schema(storageType),
      targetStorageType: storageType,
      sourceConnectionId: 'connection-1',
      targetConnectionId: 'connection-1',
    };
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
      {
        ...base,
        definitionType: DataMartDefinitionType.SQL,
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      },
      { ...base, rule: fieldRule(DataQualityCategory.FUTURE_VALUES, 'event_date') },
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

  const query = (plan: DataQualityCompiledCheck, purpose: DataQualityQueryPurpose) => {
    if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);
    const found = plan.queries.find(item => item.purpose === purpose);
    if (!found) throw new Error(`Missing ${purpose} query`);
    return found.sql;
  };

  it.each(storageTypes)('compiles all 12 categories for %s', async storageType => {
    const compiler = createDataQualityCheckCompiler();
    const plans = await Promise.all(
      allCategoryInputs(storageType).map(input => compiler.compile(input))
    );

    expect(plans).toHaveLength(12);
    for (const plan of plans) {
      expect(plan.kind).toBe('EXECUTABLE');
      if (plan.kind !== 'EXECUTABLE') continue;
      expect(plan.reproductionSql).toContain('dq_source');
      expect(plan.reproductionSql).not.toMatch(/\bLIMIT\s+\d+/i);
      const example = plan.queries.find(item => item.purpose === DataQualityQueryPurpose.EXAMPLES);
      if (example) expect(example.sql).toMatch(/\bLIMIT\s+3\s*$/i);
    }
  });

  it.each(storageTypes)('matches the 12-plan SQL contract snapshot for %s', async storageType => {
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
              queries: plan.queries,
              reproductionSql: plan.reproductionSql,
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
      timezone: 'UTC',
      rule: tableRule(DataQualityCategory.PK_UNIQUENESS),
    });
    const measurement = query(plan, DataQualityQueryPurpose.MEASUREMENT);

    expect(measurement).toContain('`id` IS NOT NULL');
    expect(measurement).toContain('`tenant_id` IS NOT NULL');
    expect(measurement).toMatch(/COUNT\(\*\)\s*-\s*1/i);
  });

  it('uses every connected materialized field including hidden and canonicalizes complex values', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: 'UTC',
      rule: tableRule(DataQualityCategory.DUPLICATE_ROWS),
    });
    const measurement = query(plan, DataQualityQueryPurpose.MEASUREMENT);

    expect(measurement).toContain('`secret`');
    expect(measurement).toContain('TO_JSON_STRING(`payload`)');
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
      timezone: 'UTC',
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
      timezone: 'UTC',
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
        definitionType: DataMartDefinitionType.SQL,
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      }),
    ]);

    for (const plan of plans) {
      expect(query(plan, DataQualityQueryPurpose.MEASUREMENT)).toContain('is_applicable');
    }
  });

  it('introspects type independently of row presence and samples only non-null values', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.SNOWFLAKE,
      sourceQuery: 'SELECT CAST(NULL AS NUMBER(38,0)) AS amount WHERE 1 = 0',
      schema: schema(DataStorageType.SNOWFLAKE),
      timezone: 'UTC',
      rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
    });

    expect(query(plan, DataQualityQueryPurpose.TYPE_INTROSPECTION)).toContain('SYSTEM$TYPEOF');
    expect(query(plan, DataQualityQueryPurpose.EXAMPLES)).toMatch(/IS NOT NULL[\s\S]*LIMIT 3$/i);
  });

  it.each(storageTypes)(
    'makes type-mismatch reproduction executable on an empty source for %s',
    async storageType => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery: 'SELECT * FROM analytics.source_table WHERE 1 = 0',
        schema: schema(storageType),
        timezone: 'UTC',
        rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
      });
      if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);

      const introspection = query(plan, DataQualityQueryPurpose.TYPE_INTROSPECTION);
      const examples = query(plan, DataQualityQueryPurpose.EXAMPLES);
      expect(plan.reproductionSql).toContain('Expected Output Schema type:');
      expect(plan.reproductionSql).toContain(introspection);
      expect(plan.reproductionSql).not.toMatch(/\bLIMIT\b/i);
      expect(introspection).not.toMatch(/\bLIMIT\b/i);
      expect(examples).toMatch(/\bLIMIT 3$/i);
    }
  );

  it('retains BigQuery field mode in the type-mismatch execution contract', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schemaWithFieldType(DataStorageType.GOOGLE_BIGQUERY, 'amount', 'INTEGER', 'REPEATED'),
      timezone: 'UTC',
      rule: fieldRule(DataQualityCategory.TYPE_MISMATCH, 'amount'),
    });

    expect(plan).toMatchObject({
      kind: 'EXECUTABLE',
      expectedNativeType: 'INTEGER',
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
        timezone: 'UTC',
        rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'items.amount'),
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
      timezone: 'UTC',
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
              name: 'items',
              type: 'RECORD',
              mode: 'REPEATED',
              status: DataMartSchemaFieldStatus.CONNECTED,
              isPrimaryKey: false,
              isHiddenForReporting: false,
              fields: [
                {
                  name: childName,
                  type: 'STRING',
                  mode: 'NULLABLE',
                  status: DataMartSchemaFieldStatus.CONNECTED,
                  isPrimaryKey: false,
                  isHiddenForReporting: false,
                },
              ],
            },
          ],
        }) as DataMartSchema;
      const snapshot: DataQualityRelationshipSnapshot = {
        ...relationship,
        joinConditions: [
          {
            sourceFieldName: unsafeSide === 'source' ? 'items.customer_id' : 'customer_id',
            targetFieldName: unsafeSide === 'target' ? 'items.id' : 'id',
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
        timezone: 'UTC',
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
        timezone: 'UTC',
        rule:
          category === DataQualityCategory.DUPLICATE_ROWS
            ? tableRule(category)
            : fieldRule(category, 'payload'),
      });

      expect(plan).toMatchObject({ kind: 'NOT_APPLICABLE' });
    }
  );

  it('uses local date but an absolute current instant for BigQuery TIMESTAMP', async () => {
    const compiler = createDataQualityCheckCompiler();
    const base = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: 'Europe/Kyiv',
    };
    const datePlan = await compiler.compile({
      ...base,
      rule: fieldRule(DataQualityCategory.FUTURE_VALUES, 'event_date'),
    });
    const timestampPlan = await compiler.compile({
      ...base,
      rule: fieldRule(DataQualityCategory.FUTURE_VALUES, 'updated_at'),
    });
    const freshnessPlan = await compiler.compile({
      ...base,
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: sourceQuery },
      rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
        thresholdHours: 24,
      }),
    });

    expect(query(datePlan, DataQualityQueryPurpose.MEASUREMENT)).toContain(
      "CURRENT_DATE('Europe/Kyiv')"
    );
    expect(query(timestampPlan, DataQualityQueryPurpose.MEASUREMENT)).toContain(
      'CURRENT_TIMESTAMP()'
    );
    expect(query(freshnessPlan, DataQualityQueryPurpose.MEASUREMENT)).toContain(
      'TIMESTAMP_SUB(CURRENT_TIMESTAMP()'
    );
    expect(query(timestampPlan, DataQualityQueryPurpose.MEASUREMENT)).not.toContain(
      'CURRENT_DATETIME'
    );
    expect(query(freshnessPlan, DataQualityQueryPurpose.MEASUREMENT)).not.toContain(
      'CURRENT_DATETIME'
    );
  });

  it.each([
    [
      DataStorageType.AWS_ATHENA,
      'TIMESTAMP',
      "CAST(current_timestamp AT TIME ZONE 'America/New_York' AS TIMESTAMP)",
      null,
    ],
    [
      DataStorageType.AWS_ATHENA,
      'TIMESTAMP WITH TIME ZONE',
      "current_timestamp AT TIME ZONE 'America/New_York'",
      'CAST(current_timestamp',
    ],
    [DataStorageType.DATABRICKS, 'TIMESTAMP', 'current_timestamp()', 'from_utc_timestamp'],
    [
      DataStorageType.DATABRICKS,
      'TIMESTAMP_NTZ',
      "CAST(from_utc_timestamp(current_timestamp(), 'America/New_York') AS TIMESTAMP_NTZ)",
      null,
    ],
    [
      DataStorageType.SNOWFLAKE,
      'TIMESTAMP',
      "CAST(CONVERT_TIMEZONE('America/New_York', CURRENT_TIMESTAMP()) AS TIMESTAMP_NTZ)",
      null,
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      'TIMESTAMP',
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'America/New_York', GETDATE())",
      'SYSDATE',
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      'TIMESTAMPTZ',
      "TIMEZONE('UTC', CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE()))",
      'SYSDATE',
    ],
  ])(
    'uses native temporal semantics for %s %s across a DST timezone',
    async (storageType, nativeType, expectedSql, forbiddenSql) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery,
        schema: schemaWithFieldType(storageType, 'updated_at', nativeType),
        timezone: 'America/New_York',
        rule: fieldRule(DataQualityCategory.FUTURE_VALUES, 'updated_at'),
      });
      const sql = query(plan, DataQualityQueryPurpose.MEASUREMENT);

      expect(sql).toContain(expectedSql);
      if (forbiddenSql) expect(sql).not.toContain(forbiddenSql);
    }
  );

  it.each([
    [
      DataStorageType.AWS_ATHENA,
      'TIMESTAMP',
      "max_value AT TIME ZONE 'America/New_York'",
      'current_timestamp',
    ],
    [DataStorageType.AWS_ATHENA, 'TIMESTAMP WITH TIME ZONE', 'max_value', 'current_timestamp'],
    [DataStorageType.DATABRICKS, 'TIMESTAMP', 'max_value', 'current_timestamp()'],
    [
      DataStorageType.DATABRICKS,
      'TIMESTAMP_NTZ',
      "to_utc_timestamp(max_value, 'America/New_York')",
      'current_timestamp()',
    ],
    [
      DataStorageType.SNOWFLAKE,
      'TIMESTAMP',
      "CONVERT_TIMEZONE('America/New_York', 'UTC', max_value)",
      "CAST(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP()) AS TIMESTAMP_NTZ)",
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      'TIMESTAMP',
      "CONVERT_TIMEZONE('America/New_York', 'UTC', max_value)",
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())",
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      'TIMESTAMPTZ',
      "TIMEZONE('UTC', max_value)",
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())",
    ],
  ])(
    'normalizes freshness to elapsed-time instants for %s %s across a DST timezone',
    async (storageType, nativeType, expectedValueSql, expectedCurrentSql) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery,
        schema: schemaWithFieldType(storageType, 'updated_at', nativeType),
        timezone: 'America/New_York',
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: sourceQuery },
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      });
      const sql = query(plan, DataQualityQueryPurpose.MEASUREMENT);

      expect(sql).toContain(expectedValueSql);
      expect(sql).toContain(expectedCurrentSql);
    }
  );

  it('uses composite null-safe relationship joins and excludes partial-null tuples', async () => {
    const compiler = createDataQualityCheckCompiler();
    const plan = await compiler.compile({
      storageType: DataStorageType.DATABRICKS,
      sourceQuery,
      schema: schema(DataStorageType.DATABRICKS),
      timezone: 'UTC',
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
    const measurement = query(plan, DataQualityQueryPurpose.MEASUREMENT);

    expect(measurement).toContain('s.`tenant_id` IS NOT NULL');
    expect(measurement).toContain('s.`customer_id` IS NOT NULL');
    expect(measurement).toContain('s.`tenant_id` <=> t.`tenant_id`');
    expect(measurement).toContain('s.`customer_id` <=> t.`id`');
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
        timezone: 'UTC',
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
      timezone: 'UTC',
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

  it('resolves a relationship target lazily after all applicability checks pass', async () => {
    const resolveTargetSourceQuery = jest.fn().mockResolvedValue(targetQuery);
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: 'UTC',
      rule: relationshipRule(DataQualityCategory.RELATIONSHIP_INTEGRITY),
      relationship: {
        snapshot: relationship,
        targetSchema: schema(DataStorageType.GOOGLE_BIGQUERY),
        targetStorageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
        resolveTargetSourceQuery,
      } as never,
    });

    expect(plan).toMatchObject({ kind: 'EXECUTABLE' });
    expect(resolveTargetSourceQuery).toHaveBeenCalledTimes(1);
  });

  it('validates timezone and numeric parameters before composing SQL', async () => {
    const compiler = createDataQualityCheckCompiler();
    const input = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: "UTC'); DROP TABLE users; --",
      rule: fieldRule(DataQualityCategory.FUTURE_VALUES, 'event_date'),
    };

    await expect(compiler.compile(input)).rejects.toThrow(/timezone/i);
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
        timezone: 'UTC',
        rule: storedRule as EffectiveDataQualityRuleConfig,
      })
    ).rejects.toThrow(/isApplicable|effective/i);
  });

  it('supports physical metadata freshness where available and reports unsupported metadata', async () => {
    const compiler = createDataQualityCheckCompiler();
    const compile = (storageType: DataStorageType, fullyQualifiedName: string) =>
      compiler.compile({
        storageType,
        sourceQuery,
        schema: schema(storageType),
        timezone: 'UTC',
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName },
        rule: rule(
          DataQualityCategory.DATA_FRESHNESS,
          { type: DataQualityScope.DATA_MART },
          { thresholdHours: 24 }
        ),
      });

    await expect(
      compile(DataStorageType.GOOGLE_BIGQUERY, 'project.dataset.table')
    ).resolves.toMatchObject({
      kind: 'EXECUTABLE',
      strategy: 'METADATA_FRESHNESS',
    });
    await expect(compile(DataStorageType.SNOWFLAKE, 'DB.SCHEMA.TABLE')).resolves.toMatchObject({
      kind: 'EXECUTABLE',
      strategy: 'METADATA_FRESHNESS',
    });
    await expect(
      compile(DataStorageType.DATABRICKS, 'catalog.schema.table')
    ).resolves.toMatchObject({
      kind: 'EXECUTABLE',
      strategy: 'METADATA_FRESHNESS',
    });
    await expect(
      compile(DataStorageType.AWS_ATHENA, 'catalog.schema.table')
    ).resolves.toMatchObject({
      kind: 'NOT_APPLICABLE',
    });
    await expect(compile(DataStorageType.AWS_REDSHIFT, 'schema.table')).resolves.toMatchObject({
      kind: 'NOT_APPLICABLE',
    });
  });

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'project.dataset.table', 'TIMESTAMP_SUB', false],
    [DataStorageType.SNOWFLAKE, 'DB.SCHEMA.TABLE', 'DATEADD', false],
    [DataStorageType.DATABRICKS, 'catalog.schema.table', 'current_timestamp()', true],
  ])(
    'builds a bounded, threshold-aware metadata reproduction for %s',
    async (storageType, fullyQualifiedName, currentExpression, usesDatabricksFileMetadata) => {
      const plan = await createDataQualityCheckCompiler().compile({
        storageType,
        sourceQuery,
        schema: schema(storageType),
        timezone: 'America/New_York',
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName },
        rule: rule(
          DataQualityCategory.DATA_FRESHNESS,
          { type: DataQualityScope.DATA_MART },
          { thresholdHours: 24 }
        ),
      });
      if (plan.kind !== 'EXECUTABLE') throw new Error(plan.reason);

      expect(plan.reproductionSql).toContain(currentExpression);
      expect(plan.reproductionSql).toMatch(/(?:last_modified_at|lastModified)\s*</i);
      if (usesDatabricksFileMetadata) {
        expect(plan.queries).toEqual([
          expect.objectContaining({
            purpose: DataQualityQueryPurpose.METADATA_FRESHNESS,
            sql: expect.stringContaining('_metadata.file_modification_time'),
          }),
        ]);
        expect(plan.queries[0].sql).not.toMatch(/DESCRIBE (?:DETAIL|HISTORY)/i);
        expect(plan.reproductionSql).toContain('_metadata.file_modification_time');
        expect(plan.reproductionSql).toContain('FROM `catalog`.`schema`.`table`');
        expect(plan.reproductionSql).toMatch(/WHERE last_modified_at < .*current_timestamp\(\)/i);
        expect(plan.reproductionSql).not.toMatch(/DESCRIBE (?:DETAIL|HISTORY)/i);
        expect(plan.reproductionSql).not.toMatch(/\bLIMIT\b/i);
      } else {
        expect(plan.reproductionSql).not.toMatch(/\bLIMIT\b/i);
      }
    }
  );

  it('uses metadata only for physical TABLE or CONNECTOR and field MAX only for logical sources', async () => {
    const compiler = createDataQualityCheckCompiler();
    const base = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: 'UTC',
    };

    await expect(
      compiler.compile({
        ...base,
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.table' },
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      })
    ).resolves.toMatchObject({ kind: 'NOT_APPLICABLE' });

    await expect(
      compiler.compile({
        ...base,
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: {
          connector: {
            source: {
              name: 'google-ads',
              configuration: [{}],
              node: 'ad_group',
              fields: ['id'],
            },
            storage: { fullyQualifiedName: 'project.dataset.connector_table' },
          },
        },
        rule: rule(
          DataQualityCategory.DATA_FRESHNESS,
          { type: DataQualityScope.DATA_MART },
          { thresholdHours: 24 }
        ),
      })
    ).resolves.toMatchObject({ kind: 'EXECUTABLE', strategy: 'METADATA_FRESHNESS' });

    await expect(
      compiler.compile({
        ...base,
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: sourceQuery },
        rule: rule(
          DataQualityCategory.DATA_FRESHNESS,
          { type: DataQualityScope.DATA_MART },
          { thresholdHours: 24 }
        ),
      })
    ).resolves.toMatchObject({ kind: 'NOT_APPLICABLE' });
  });

  it('converts DATE freshness values into a timezone-aware timestamp before hour comparison', async () => {
    const plan = await createDataQualityCheckCompiler().compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: 'Europe/Kyiv',
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: sourceQuery },
      rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'event_date', {
        thresholdHours: 24,
      }),
    });

    expect(query(plan, DataQualityQueryPurpose.MEASUREMENT)).toContain(
      "TIMESTAMP(max_value, 'Europe/Kyiv')"
    );
  });

  it.each([DataQualityCategory.FUTURE_VALUES, DataQualityCategory.DATA_FRESHNESS])(
    'does not treat BigQuery DATETIME as DATE/TIMESTAMP for %s',
    async category => {
      const datetimeSchema = schema(DataStorageType.GOOGLE_BIGQUERY) as unknown as {
        fields: Array<Record<string, unknown>>;
      };
      const updatedAt = datetimeSchema.fields.find(field => field.name === 'updated_at');
      if (updatedAt) updatedAt.type = 'DATETIME';

      const plan = await createDataQualityCheckCompiler().compile({
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sourceQuery,
        schema: datetimeSchema as unknown as DataMartSchema,
        timezone: 'UTC',
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: sourceQuery },
        rule: fieldRule(
          category,
          'updated_at',
          category === DataQualityCategory.DATA_FRESHNESS ? { thresholdHours: 24 } : {}
        ),
      });

      expect(plan.kind).toBe('NOT_APPLICABLE');
    }
  );

  it('projects only the field value and connected PK locators in every field example query', async () => {
    const compiler = createDataQualityCheckCompiler();
    const base = {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: schema(DataStorageType.GOOGLE_BIGQUERY),
      timezone: 'UTC',
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
        definitionType: DataMartDefinitionType.SQL,
        rule: fieldRule(DataQualityCategory.DATA_FRESHNESS, 'updated_at', {
          thresholdHours: 24,
        }),
      },
      { ...base, rule: fieldRule(DataQualityCategory.FUTURE_VALUES, 'event_date') },
      { ...base, rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount') },
    ];

    for (const input of inputs) {
      const plan = await compiler.compile(input);
      const examples = query(plan, DataQualityQueryPurpose.EXAMPLES);
      const finalSelect = examples.slice(examples.lastIndexOf('\nSELECT '));
      expect(finalSelect).toContain('AS dq_value');
      expect(finalSelect).toContain('AS dq_pk_0');
      expect(finalSelect).not.toMatch(/SELECT\s+[sv]\.\*/i);
      expect(finalSelect).toMatch(/LIMIT 3$/i);
    }
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
      timezone: 'UTC',
      rule: fieldRule(DataQualityCategory.NEGATIVE_VALUES, 'amount'),
    });
    const relationshipPlan = await compiler.compile({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      sourceQuery,
      schema: outputSchema as unknown as DataMartSchema,
      timezone: 'UTC',
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
      const examples = query(plan, DataQualityQueryPurpose.EXAMPLES);
      expect(examples).not.toContain('dq_pk_2');
      expect(examples).not.toMatch(/`items`\.`id`/);
    }
  });
});
