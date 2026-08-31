import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { BigQueryFieldMode } from '../data-storage-types/bigquery/enums/bigquery-field-mode.enum';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { BigQueryDataMartSchemaType } from '../data-storage-types/bigquery/schemas/bigquery-data-mart.schema';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
  EffectiveDataQualityConfig,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { resolveEffectiveDataQualityConfig } from './data-quality-config-resolver';

describe('resolveEffectiveDataQualityConfig', () => {
  const field = (
    name: string,
    options: {
      primaryKey?: boolean;
      status?: DataMartSchemaFieldStatus;
      type?: BigQueryFieldType;
      calculated?: { formula: string; level: 'metric' };
    } = {}
  ) => ({
    name,
    type: options.type ?? BigQueryFieldType.STRING,
    mode: BigQueryFieldMode.NULLABLE,
    status: options.status ?? DataMartSchemaFieldStatus.CONNECTED,
    isPrimaryKey: options.primaryKey ?? false,
    isHiddenForReporting: false,
    ...(options.calculated ? { calculated: options.calculated } : {}),
  });

  const schema = (...fields: ReturnType<typeof field>[]): DataMartSchema => ({
    type: BigQueryDataMartSchemaType,
    fields,
  });

  const relationship = (
    id: string,
    sourceFieldName = 'customer_id'
  ): DataQualityRelationshipSnapshot => ({
    id,
    sourceDataMartId: 'dm-1',
    targetDataMartId: 'dm-2',
    targetAlias: 'customers',
    joinConditions: [{ sourceFieldName, targetFieldName: 'id' }],
  });

  const findRule = (
    config: EffectiveDataQualityConfig,
    category: DataQualityCategory,
    scopeType: DataQualityScope,
    scopeId?: string | string[]
  ) =>
    config.rules.find(rule => {
      if (rule.category !== category || rule.scope.type !== scopeType) return false;
      if (rule.scope.type === DataQualityScope.FIELD) {
        const expectedPath =
          typeof scopeId === 'string' ? [scopeId] : Array.isArray(scopeId) ? scopeId : [];
        return JSON.stringify(rule.scope.fieldPath) === JSON.stringify(expectedPath);
      }
      if (rule.scope.type === DataQualityScope.RELATIONSHIP) {
        return rule.scope.relationshipId === scopeId;
      }
      return scopeId === undefined;
    });

  const storedConfig = (config: EffectiveDataQualityConfig): DataQualityConfig =>
    DataQualityConfigSchema.parse({
      rules: config.rules.map(
        ({ isApplicable: _isApplicable, notApplicableReason: _reason, ...rule }) => rule
      ),
    });

  const resolveForDefinition = (
    savedConfig: DataQualityConfig | null | undefined,
    outputSchema: DataMartSchema | null | undefined,
    relationships: readonly DataQualityRelationshipSnapshot[],
    _definitionType: DataMartDefinitionType | null | undefined = DataMartDefinitionType.SQL
  ): EffectiveDataQualityConfig =>
    resolveEffectiveDataQualityConfig(savedConfig, outputSchema, relationships);

  it('resolves null config to the documented system preset', () => {
    const result = resolveForDefinition(
      null,
      schema(
        field('id', { primaryKey: true }),
        field('customer_id'),
        field('amount', { type: BigQueryFieldType.INTEGER })
      ),
      [relationship('rel-1')]
    );

    expect(
      findRule(result, DataQualityCategory.EMPTY_TABLE, DataQualityScope.DATA_MART)
    ).toMatchObject({
      enabled: true,
      isApplicable: true,
      severity: DataQualitySeverity.ERROR,
    });
    expect(
      findRule(result, DataQualityCategory.PK_UNIQUENESS, DataQualityScope.DATA_MART)
    ).toMatchObject({ enabled: true, isApplicable: true, severity: DataQualitySeverity.ERROR });
    expect(
      findRule(result, DataQualityCategory.NULL_RATE, DataQualityScope.FIELD, 'id')
    ).toMatchObject({
      enabled: true,
      severity: DataQualitySeverity.ERROR,
      parameters: { thresholdPercent: 0 },
    });
    expect(
      findRule(result, DataQualityCategory.NULL_RATE, DataQualityScope.FIELD, 'customer_id')
    ).toMatchObject({
      enabled: true,
      severity: DataQualitySeverity.WARNING,
      parameters: { thresholdPercent: 0 },
    });
    expect(
      findRule(
        result,
        DataQualityCategory.RELATIONSHIP_INTEGRITY,
        DataQualityScope.RELATIONSHIP,
        'rel-1'
      )
    ).toMatchObject({
      enabled: true,
      severity: DataQualitySeverity.WARNING,
      isApplicable: true,
    });
    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'amount')
    ).toMatchObject({ enabled: false, isApplicable: true });
  });

  it('builds the system preset for provider-valid field names longer than 255 characters', () => {
    const longFieldName = 'x'.repeat(300);

    const result = resolveForDefinition(null, schema(field(longFieldName)), []);

    expect(
      findRule(result, DataQualityCategory.TYPE_MISMATCH, DataQualityScope.FIELD, longFieldName)
    ).toMatchObject({
      key: `type_mismatch:field:${JSON.stringify([longFieldName])}`,
      isApplicable: true,
    });
  });

  it('keeps the documented severity and parameters on disabled preset rules', () => {
    const result = resolveForDefinition(
      null,
      schema(
        field('id', { primaryKey: true }),
        field('customer_id'),
        field('amount'),
        field('updated_at', { type: BigQueryFieldType.TIMESTAMP })
      ),
      [relationship('rel-1')]
    );

    const expectedTableRules = [
      [DataQualityCategory.EMPTY_TABLE, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.PK_UNIQUENESS, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.DUPLICATE_ROWS, DataQualitySeverity.ERROR, {}],
    ] as const;
    for (const [category, severity, parameters] of expectedTableRules) {
      expect(findRule(result, category, DataQualityScope.DATA_MART)).toMatchObject({
        severity,
        parameters,
      });
    }
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.DATA_MART)
    ).toBeUndefined();

    const expectedFieldRules = [
      [DataQualityCategory.NULL_RATE, DataQualitySeverity.WARNING, { thresholdPercent: 0 }],
      [DataQualityCategory.COLUMN_UNIQUENESS, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.CONSTANT_COLUMN, DataQualitySeverity.NOTICE, {}],
      [DataQualityCategory.TYPE_MISMATCH, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.NEGATIVE_VALUES, DataQualitySeverity.WARNING, {}],
    ] as const;
    for (const [category, severity, parameters] of expectedFieldRules) {
      expect(findRule(result, category, DataQualityScope.FIELD, 'amount')).toMatchObject({
        severity,
        parameters,
      });
    }
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'updated_at')
    ).toMatchObject({
      severity: DataQualitySeverity.WARNING,
      parameters: { thresholdHours: 24 },
    });

    expect(
      findRule(
        result,
        DataQualityCategory.RELATIONSHIP_INTEGRITY,
        DataQualityScope.RELATIONSHIP,
        'rel-1'
      )
    ).toMatchObject({ severity: DataQualitySeverity.WARNING });
    expect(
      findRule(
        result,
        DataQualityCategory.REVERSE_RELATIONSHIP,
        DataQualityScope.RELATIONSHIP,
        'rel-1'
      )
    ).toMatchObject({ severity: DataQualitySeverity.NOTICE });
  });

  it('marks primary-key checks not applicable when no primary key exists', () => {
    const result = resolveForDefinition(null, schema(field('id')), []);
    expect(
      findRule(result, DataQualityCategory.PK_UNIQUENESS, DataQualityScope.DATA_MART)
    ).toMatchObject({ enabled: false, isApplicable: false });
  });

  it('marks duplicate rows not applicable when no materialized fields exist', () => {
    const result = resolveForDefinition(null, schema(), []);

    expect(
      findRule(result, DataQualityCategory.DUPLICATE_ROWS, DataQualityScope.DATA_MART)
    ).toMatchObject({ isApplicable: false, notApplicableReason: expect.any(String) });
  });

  it('derives field applicability from provider-normalized Output Schema types', () => {
    const result = resolveForDefinition(
      null,
      schema(
        field('label'),
        field('amount', { type: BigQueryFieldType.INTEGER }),
        field('event_date', { type: BigQueryFieldType.DATE }),
        field('updated_at', { type: BigQueryFieldType.TIMESTAMP }),
        field('local_datetime', { type: BigQueryFieldType.DATETIME })
      ),
      []
    );

    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'amount')
    ).toMatchObject({ isApplicable: true });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'updated_at')
    ).toMatchObject({ isApplicable: true, parameters: { thresholdHours: 24 } });

    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'label')
    ).toMatchObject({
      enabled: false,
      isApplicable: false,
      notApplicableReason: expect.any(String),
    });
    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'event_date')
    ).toMatchObject({ isApplicable: false });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'event_date')
    ).toBeUndefined();
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'label')
    ).toBeUndefined();
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'local_datetime')
    ).toBeUndefined();
  });

  it.each([
    ['bigquery-data-mart-schema', 'TIMESTAMP', true],
    ['bigquery-data-mart-schema', 'DATE', false],
    ['athena-data-mart-schema', 'TIMESTAMP WITH TIME ZONE', true],
    ['athena-data-mart-schema', 'TIMESTAMP', false],
    ['snowflake-data-mart-schema', 'TIMESTAMP', false],
    ['redshift-data-mart-schema', 'TIMESTAMPTZ', true],
    ['redshift-data-mart-schema', 'TIMESTAMP', false],
    ['databricks-data-mart-schema', 'TIMESTAMP', true],
    ['databricks-data-mart-schema', 'TIMESTAMP_NTZ', false],
  ] as const)('for %s field type %s freshness generated=%s', (schemaType, nativeType, expected) => {
    const outputSchema = {
      type: schemaType,
      fields: [
        {
          name: 'checked_at',
          type: nativeType,
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
          ...(schemaType === BigQueryDataMartSchemaType
            ? { mode: BigQueryFieldMode.NULLABLE }
            : {}),
        },
      ],
    } as DataMartSchema;

    const result = resolveForDefinition(null, outputSchema, []);
    const freshness = findRule(
      result,
      DataQualityCategory.DATA_FRESHNESS,
      DataQualityScope.FIELD,
      'checked_at'
    );

    expect(Boolean(freshness)).toBe(expected);
  });

  it.each([
    ['bigquery-data-mart-schema', 'GEOGRAPHY'],
    ['redshift-data-mart-schema', 'GEOMETRY'],
  ])(
    'marks grouping checks not applicable when %s fields cannot be canonicalized',
    (schemaType, spatialType) => {
      const outputSchema = {
        type: schemaType,
        fields: [
          {
            name: 'location',
            type: spatialType,
            status: DataMartSchemaFieldStatus.CONNECTED,
            isPrimaryKey: false,
            isHiddenForReporting: false,
            ...(schemaType === 'bigquery-data-mart-schema'
              ? { mode: BigQueryFieldMode.NULLABLE }
              : {}),
          },
        ],
      } as DataMartSchema;

      const result = resolveForDefinition(null, outputSchema, []);

      expect(
        findRule(result, DataQualityCategory.DUPLICATE_ROWS, DataQualityScope.DATA_MART)
      ).toMatchObject({ isApplicable: false, notApplicableReason: expect.any(String) });
      for (const category of [
        DataQualityCategory.COLUMN_UNIQUENESS,
        DataQualityCategory.CONSTANT_COLUMN,
      ]) {
        expect(findRule(result, category, DataQualityScope.FIELD, 'location')).toMatchObject({
          isApplicable: false,
          notApplicableReason: expect.any(String),
        });
      }
    }
  );

  it('preserves descendants of a repeated BigQuery record but marks every field check not applicable', () => {
    const outputSchema = {
      type: BigQueryDataMartSchemaType,
      fields: [
        {
          ...field('items', { type: BigQueryFieldType.RECORD }),
          mode: BigQueryFieldMode.REPEATED,
          fields: [field('amount', { type: BigQueryFieldType.INTEGER })],
        },
      ],
    } as DataMartSchema;

    const result = resolveForDefinition(null, outputSchema, []);
    const nestedRules = result.rules.filter(
      rule =>
        rule.scope.type === DataQualityScope.FIELD &&
        JSON.stringify(rule.scope.fieldPath) === JSON.stringify(['items', 'amount'])
    );

    expect(nestedRules).toHaveLength(5);
    expect(nestedRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: DataQualityCategory.TYPE_MISMATCH }),
        expect.objectContaining({ category: DataQualityCategory.NEGATIVE_VALUES }),
      ])
    );
    expect(nestedRules.every(rule => !rule.isApplicable)).toBe(true);
    expect(
      nestedRules.every(rule => rule.notApplicableReason?.includes('flattening') === true)
    ).toBe(true);
  });

  it('keeps type mismatch applicable but disables scalar checks for a top-level BigQuery REPEATED field', () => {
    const repeatedField = {
      ...field('values', { type: BigQueryFieldType.INTEGER }),
      mode: BigQueryFieldMode.REPEATED,
    };
    const result = resolveForDefinition(null, schema(repeatedField), []);

    expect(
      findRule(result, DataQualityCategory.TYPE_MISMATCH, DataQualityScope.FIELD, 'values')
    ).toMatchObject({ isApplicable: true });
    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'values')
    ).toMatchObject({
      isApplicable: false,
      notApplicableReason: expect.stringContaining('flattening'),
    });
    expect(
      findRule(result, DataQualityCategory.COLUMN_UNIQUENESS, DataQualityScope.FIELD, 'values')
    ).toMatchObject({
      isApplicable: false,
      notApplicableReason: expect.stringContaining('flattening'),
    });
  });

  it('does not cross-enable literal dotted and segmented nested field paths', () => {
    const outputSchema = {
      type: BigQueryDataMartSchemaType,
      fields: [
        field('customer.id'),
        {
          ...field('customer', { type: BigQueryFieldType.RECORD }),
          fields: [field('id')],
        },
      ],
    } as DataMartSchema;
    const preset = resolveForDefinition(null, outputSchema, []);
    const literalRule = findRule(preset, DataQualityCategory.NULL_RATE, DataQualityScope.FIELD, [
      'customer.id',
    ]);
    const nestedRule = findRule(preset, DataQualityCategory.NULL_RATE, DataQualityScope.FIELD, [
      'customer',
      'id',
    ]);
    if (!literalRule || !nestedRule) throw new Error('Expected both field-path rules');
    const saved = storedConfig(preset);
    saved.rules = saved.rules.map(rule => ({
      ...rule,
      enabled: rule.key === literalRule.key,
    }));

    const resolved = resolveForDefinition(saved, outputSchema, []);

    expect(literalRule.key).not.toBe(nestedRule.key);
    expect(
      findRule(resolved, DataQualityCategory.NULL_RATE, DataQualityScope.FIELD, ['customer.id'])
    ).toMatchObject({ enabled: true });
    expect(
      findRule(resolved, DataQualityCategory.NULL_RATE, DataQualityScope.FIELD, ['customer', 'id'])
    ).toMatchObject({ enabled: false });
  });

  it('marks PK uniqueness not applicable when a nested primary key requires flattening', () => {
    const outputSchema = {
      type: BigQueryDataMartSchemaType,
      fields: [
        {
          ...field('items', { type: BigQueryFieldType.RECORD }),
          mode: BigQueryFieldMode.REPEATED,
          fields: [
            field('id', {
              primaryKey: true,
              type: BigQueryFieldType.INTEGER,
            }),
          ],
        },
      ],
    } as DataMartSchema;

    const result = resolveForDefinition(null, outputSchema, []);

    expect(
      findRule(result, DataQualityCategory.PK_UNIQUENESS, DataQualityScope.DATA_MART)
    ).toMatchObject({
      enabled: true,
      isApplicable: false,
      notApplicableReason: expect.stringContaining('flattening'),
    });
  });

  it('marks relationship checks not applicable when a source join field requires flattening', () => {
    const outputSchema = {
      type: BigQueryDataMartSchemaType,
      fields: [
        {
          ...field('customer_id'),
          mode: BigQueryFieldMode.REPEATED,
        },
      ],
    } as DataMartSchema;
    const nestedRelationship = relationship('rel-1', 'customer_id');

    const result = resolveForDefinition(null, outputSchema, [nestedRelationship]);
    const relationshipRules = result.rules.filter(
      rule =>
        rule.scope.type === DataQualityScope.RELATIONSHIP &&
        rule.scope.relationshipId === nestedRelationship.id
    );

    expect(relationshipRules).toHaveLength(2);
    expect(relationshipRules.every(rule => !rule.isApplicable)).toBe(true);
    expect(
      relationshipRules.every(rule => rule.notApplicableReason?.includes('flattening') === true)
    ).toBe(true);
  });

  it('marks descendants of a Snowflake semi-structured container not applicable', () => {
    const outputSchema = {
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
    } as DataMartSchema;

    const result = resolveForDefinition(null, outputSchema, []);

    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, [
        'items',
        'amount',
      ])
    ).toMatchObject({
      isApplicable: false,
      notApplicableReason: expect.stringContaining('flattening'),
    });
  });

  it.each([DataMartDefinitionType.TABLE, DataMartDefinitionType.CONNECTOR])(
    'uses only FIELD freshness for physical %s definitions',
    definitionType => {
      const result = resolveForDefinition(
        null,
        schema(
          field('updated_at', { type: BigQueryFieldType.TIMESTAMP }),
          field('event_date', { type: BigQueryFieldType.DATE })
        ),
        [],
        definitionType
      );

      expect(
        findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.DATA_MART)
      ).toBeUndefined();
      expect(
        result.rules.filter(
          rule =>
            rule.category === DataQualityCategory.DATA_FRESHNESS &&
            rule.scope.type === DataQualityScope.FIELD
        )
      ).toEqual([
        expect.objectContaining({
          isApplicable: true,
        }),
      ]);
    }
  );

  it.each([
    DataMartDefinitionType.SQL,
    DataMartDefinitionType.VIEW,
    DataMartDefinitionType.TABLE_PATTERN,
  ])('uses only FIELD freshness for logical %s definitions', definitionType => {
    const result = resolveForDefinition(
      null,
      schema(
        field('updated_at', { type: BigQueryFieldType.TIMESTAMP }),
        field('label', { type: BigQueryFieldType.STRING })
      ),
      [],
      definitionType
    );

    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.DATA_MART)
    ).toBeUndefined();
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'updated_at')
    ).toMatchObject({ isApplicable: true });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'label')
    ).toBeUndefined();
  });

  it('does not require a definition type for field freshness', () => {
    const result = resolveForDefinition(
      null,
      schema(field('updated_at', { type: BigQueryFieldType.TIMESTAMP })),
      [],
      null
    );

    expect(
      result.rules.filter(rule => rule.category === DataQualityCategory.DATA_FRESHNESS)
    ).toEqual([
      expect.objectContaining({
        scope: { type: DataQualityScope.FIELD, fieldPath: ['updated_at'] },
        isApplicable: true,
      }),
    ]);
  });

  it('treats a saved empty rules array as an explicit all-disabled override', () => {
    const result = resolveForDefinition(
      { rules: [] },
      schema(field('id', { primaryKey: true }), field('customer_id')),
      [relationship('rel-1')]
    );

    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.rules.every(rule => !rule.enabled)).toBe(true);
  });

  it('adds newly discovered field and relationship scopes disabled', () => {
    const saved = resolveForDefinition(null, schema(field('id')), []);
    const result = resolveForDefinition(
      storedConfig(saved),
      schema(field('id'), field('new_field')),
      [relationship('new-rel', 'new_field')]
    );

    const newFieldRules = result.rules.filter(
      rule =>
        rule.scope.type === DataQualityScope.FIELD &&
        JSON.stringify(rule.scope.fieldPath) === JSON.stringify(['new_field'])
    );
    const newRelationshipRules = result.rules.filter(
      rule =>
        rule.scope.type === DataQualityScope.RELATIONSHIP && rule.scope.relationshipId === 'new-rel'
    );
    expect(newFieldRules.length).toBeGreaterThan(0);
    expect(newFieldRules.every(rule => !rule.enabled)).toBe(true);
    expect(newRelationshipRules.length).toBeGreaterThan(0);
    expect(newRelationshipRules.every(rule => !rule.enabled)).toBe(true);
  });

  it('retains stale field and relationship scopes as not applicable', () => {
    const saved = resolveForDefinition(null, schema(field('id'), field('old_field')), [
      relationship('old-rel', 'old_field'),
    ]);
    const result = resolveForDefinition(storedConfig(saved), schema(field('id')), []);

    const staleRules = result.rules.filter(
      rule =>
        (rule.scope.type === DataQualityScope.FIELD &&
          JSON.stringify(rule.scope.fieldPath) === JSON.stringify(['old_field'])) ||
        (rule.scope.type === DataQualityScope.RELATIONSHIP &&
          rule.scope.relationshipId === 'old-rel')
    );
    expect(staleRules.length).toBeGreaterThan(0);
    expect(staleRules.every(rule => !rule.isApplicable)).toBe(true);
    expect(staleRules.every(rule => Boolean(rule.notApplicableReason))).toBe(true);
  });

  it('explains when a saved freshness field still exists but is no longer eligible', () => {
    const initial = resolveForDefinition(
      null,
      schema(field('updated_at', { type: BigQueryFieldType.TIMESTAMP })),
      []
    );
    const saved = storedConfig(initial);
    const freshnessRule = saved.rules.find(
      rule =>
        rule.category === DataQualityCategory.DATA_FRESHNESS &&
        rule.scope.type === DataQualityScope.FIELD
    );
    expect(freshnessRule).toBeDefined();
    if (freshnessRule) freshnessRule.enabled = true;

    const result = resolveForDefinition(saved, schema(field('updated_at')), []);

    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'updated_at')
    ).toMatchObject({
      enabled: true,
      isApplicable: false,
      notApplicableReason: expect.stringContaining('no longer eligible'),
    });
  });

  it('fails loudly for an unknown Output Schema provider', () => {
    const unsupportedSchema = {
      type: 'new-provider-data-mart-schema',
      fields: [],
    } as unknown as DataMartSchema;

    expect(() => resolveForDefinition(null, unsupportedSchema, [])).toThrow(
      'Unsupported Data Mart schema type'
    );
  });

  it('keeps inaccessible relationship rules enabled but marks them not applicable', () => {
    const inaccessible = { ...relationship('rel-1'), targetAccessible: false };

    const result = resolveForDefinition(null, schema(field('customer_id')), [inaccessible]);

    expect(
      findRule(
        result,
        DataQualityCategory.RELATIONSHIP_INTEGRITY,
        DataQualityScope.RELATIONSHIP,
        'rel-1'
      )
    ).toMatchObject({
      enabled: true,
      isApplicable: false,
      notApplicableReason: expect.stringContaining('not accessible'),
    });
  });

  it('treats disconnected fields as stale and produces deterministic ordering', () => {
    const first = resolveForDefinition(
      null,
      schema(
        field('b'),
        field('a'),
        field('gone', { status: DataMartSchemaFieldStatus.DISCONNECTED })
      ),
      [relationship('rel-b', 'b'), relationship('rel-a', 'a')]
    );
    const second = resolveForDefinition(
      null,
      schema(
        field('a'),
        field('b'),
        field('gone', { status: DataMartSchemaFieldStatus.DISCONNECTED })
      ),
      [relationship('rel-a', 'a'), relationship('rel-b', 'b')]
    );

    expect(first).toEqual(second);
    expect(
      first.rules.some(
        rule =>
          rule.scope.type === DataQualityScope.FIELD &&
          JSON.stringify(rule.scope.fieldPath) === JSON.stringify(['gone'])
      )
    ).toBe(false);
    expect(first.rules.map(rule => rule.key)).toEqual(
      [...first.rules.map(rule => rule.key)].sort((a, b) => a.localeCompare(b))
    );
  });

  it('never generates a physical-projection rule for a calculated field', () => {
    const result = resolveForDefinition(
      null,
      schema(
        field('id', { primaryKey: true }),
        field('ctr', {
          type: BigQueryFieldType.FLOAT,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        })
      ),
      []
    );

    // No FIELD-scoped rule of any category should target the calculated field's path: every
    // such rule compiles into a SQL expression that would reference `ctr` as a real column.
    expect(
      result.rules.some(
        rule =>
          rule.scope.type === DataQualityScope.FIELD &&
          JSON.stringify(rule.scope.fieldPath) === JSON.stringify(['ctr'])
      )
    ).toBe(false);
  });

  it('groups DUPLICATE_ROWS by physical fields only, ignoring a calculated field', () => {
    const result = resolveForDefinition(
      null,
      schema(
        field('id'),
        field('ctr', {
          type: BigQueryFieldType.FLOAT,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        })
      ),
      []
    );

    // Still applicable: a real materialized field ('id') remains, so the calculated field being
    // excluded must not make the whole check inapplicable.
    expect(
      findRule(result, DataQualityCategory.DUPLICATE_ROWS, DataQualityScope.DATA_MART)
    ).toMatchObject({ isApplicable: true });
  });

  it('marks duplicate rows not applicable when the only field is calculated', () => {
    const result = resolveForDefinition(
      null,
      schema(
        field('ctr', {
          type: BigQueryFieldType.FLOAT,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        })
      ),
      []
    );

    expect(
      findRule(result, DataQualityCategory.DUPLICATE_ROWS, DataQualityScope.DATA_MART)
    ).toMatchObject({ isApplicable: false, notApplicableReason: expect.any(String) });
  });
});
