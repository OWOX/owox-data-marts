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
    } = {}
  ) => ({
    name,
    type: options.type ?? BigQueryFieldType.STRING,
    mode: BigQueryFieldMode.NULLABLE,
    status: options.status ?? DataMartSchemaFieldStatus.CONNECTED,
    isPrimaryKey: options.primaryKey ?? false,
    isHiddenForReporting: false,
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
    scopeId?: string
  ) =>
    config.rules.find(rule => {
      if (rule.category !== category || rule.scope.type !== scopeType) return false;
      if (rule.scope.type === DataQualityScope.FIELD) return rule.scope.fieldId === scopeId;
      if (rule.scope.type === DataQualityScope.RELATIONSHIP) {
        return rule.scope.relationshipId === scopeId;
      }
      return scopeId === undefined;
    });

  const storedConfig = (config: EffectiveDataQualityConfig): DataQualityConfig =>
    DataQualityConfigSchema.parse({
      timezone: config.timezone,
      rules: config.rules.map(
        ({ isApplicable: _isApplicable, notApplicableReason: _reason, ...rule }) => rule
      ),
    });

  const resolveForDefinition = (
    savedConfig: DataQualityConfig | null | undefined,
    outputSchema: DataMartSchema | null | undefined,
    relationships: readonly DataQualityRelationshipSnapshot[],
    definitionType: DataMartDefinitionType | null | undefined = DataMartDefinitionType.SQL
  ): EffectiveDataQualityConfig =>
    resolveEffectiveDataQualityConfig(savedConfig, outputSchema, relationships, definitionType);

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
      key: `type_mismatch:field:${longFieldName}`,
      isApplicable: true,
    });
  });

  it('keeps the documented severity and parameters on disabled preset rules', () => {
    const result = resolveForDefinition(
      null,
      schema(field('id', { primaryKey: true }), field('customer_id'), field('amount')),
      [relationship('rel-1')]
    );

    const expectedTableRules = [
      [DataQualityCategory.EMPTY_TABLE, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.PK_UNIQUENESS, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.DUPLICATE_ROWS, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.DATA_FRESHNESS, DataQualitySeverity.WARNING, { thresholdHours: 24 }],
    ] as const;
    for (const [category, severity, parameters] of expectedTableRules) {
      expect(findRule(result, category, DataQualityScope.DATA_MART)).toMatchObject({
        severity,
        parameters,
      });
    }

    const expectedFieldRules = [
      [DataQualityCategory.NULL_RATE, DataQualitySeverity.WARNING, { thresholdPercent: 0 }],
      [DataQualityCategory.COLUMN_UNIQUENESS, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.CONSTANT_COLUMN, DataQualitySeverity.NOTICE, {}],
      [DataQualityCategory.TYPE_MISMATCH, DataQualitySeverity.ERROR, {}],
      [DataQualityCategory.DATA_FRESHNESS, DataQualitySeverity.WARNING, { thresholdHours: 24 }],
      [DataQualityCategory.FUTURE_VALUES, DataQualitySeverity.WARNING, {}],
      [DataQualityCategory.NEGATIVE_VALUES, DataQualitySeverity.WARNING, {}],
    ] as const;
    for (const [category, severity, parameters] of expectedFieldRules) {
      expect(findRule(result, category, DataQualityScope.FIELD, 'amount')).toMatchObject({
        severity,
        parameters,
      });
    }

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
      findRule(result, DataQualityCategory.FUTURE_VALUES, DataQualityScope.FIELD, 'event_date')
    ).toMatchObject({ isApplicable: true });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'updated_at')
    ).toMatchObject({ isApplicable: true, parameters: { thresholdHours: 24 } });

    for (const category of [
      DataQualityCategory.NEGATIVE_VALUES,
      DataQualityCategory.FUTURE_VALUES,
      DataQualityCategory.DATA_FRESHNESS,
    ]) {
      expect(findRule(result, category, DataQualityScope.FIELD, 'label')).toMatchObject({
        enabled: false,
        isApplicable: false,
        notApplicableReason: expect.any(String),
      });
    }
    expect(
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'event_date')
    ).toMatchObject({ isApplicable: false });
    expect(
      findRule(result, DataQualityCategory.FUTURE_VALUES, DataQualityScope.FIELD, 'amount')
    ).toMatchObject({ isApplicable: false });
    expect(
      findRule(result, DataQualityCategory.FUTURE_VALUES, DataQualityScope.FIELD, 'local_datetime')
    ).toMatchObject({ isApplicable: false });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'local_datetime')
    ).toMatchObject({ isApplicable: false });
  });

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
      rule => rule.scope.type === DataQualityScope.FIELD && rule.scope.fieldId === 'items.amount'
    );

    expect(nestedRules).toHaveLength(7);
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
          ...field('items', { type: BigQueryFieldType.RECORD }),
          mode: BigQueryFieldMode.REPEATED,
          fields: [field('customer_id')],
        },
      ],
    } as DataMartSchema;
    const nestedRelationship = relationship('rel-1', 'items.customer_id');

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
      findRule(result, DataQualityCategory.NEGATIVE_VALUES, DataQualityScope.FIELD, 'items.amount')
    ).toMatchObject({
      isApplicable: false,
      notApplicableReason: expect.stringContaining('flattening'),
    });
  });

  it.each([DataMartDefinitionType.TABLE, DataMartDefinitionType.CONNECTOR])(
    'uses only DATA_MART metadata freshness for physical %s definitions',
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
      ).toMatchObject({ isApplicable: true });
      expect(
        result.rules.filter(
          rule =>
            rule.category === DataQualityCategory.DATA_FRESHNESS &&
            rule.scope.type === DataQualityScope.FIELD
        )
      ).toEqual([
        expect.objectContaining({
          isApplicable: false,
          notApplicableReason: expect.stringContaining('physical'),
        }),
        expect.objectContaining({
          isApplicable: false,
          notApplicableReason: expect.stringContaining('physical'),
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
    ).toMatchObject({
      isApplicable: false,
      notApplicableReason: expect.stringContaining('logical'),
    });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'updated_at')
    ).toMatchObject({ isApplicable: true });
    expect(
      findRule(result, DataQualityCategory.DATA_FRESHNESS, DataQualityScope.FIELD, 'label')
    ).toMatchObject({
      isApplicable: false,
      notApplicableReason: expect.stringContaining('DATE or TIMESTAMP'),
    });
  });

  it('marks both freshness strategies not applicable without a definition type', () => {
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
        scope: { type: DataQualityScope.DATA_MART },
        isApplicable: false,
        notApplicableReason: expect.stringContaining('definition type'),
      }),
      expect.objectContaining({
        scope: { type: DataQualityScope.FIELD, fieldId: 'updated_at' },
        isApplicable: false,
        notApplicableReason: expect.stringContaining('definition type'),
      }),
    ]);
  });

  it('treats a saved empty rules array as an explicit all-disabled override', () => {
    const result = resolveForDefinition(
      { timezone: 'Europe/Kyiv', rules: [] },
      schema(field('id', { primaryKey: true }), field('customer_id')),
      [relationship('rel-1')]
    );

    expect(result.timezone).toBe('Europe/Kyiv');
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
      rule => rule.scope.type === DataQualityScope.FIELD && rule.scope.fieldId === 'new_field'
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
        (rule.scope.type === DataQualityScope.FIELD && rule.scope.fieldId === 'old_field') ||
        (rule.scope.type === DataQualityScope.RELATIONSHIP &&
          rule.scope.relationshipId === 'old-rel')
    );
    expect(staleRules.length).toBeGreaterThan(0);
    expect(staleRules.every(rule => !rule.isApplicable)).toBe(true);
    expect(staleRules.every(rule => Boolean(rule.notApplicableReason))).toBe(true);
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
        rule => rule.scope.type === DataQualityScope.FIELD && rule.scope.fieldId === 'gone'
      )
    ).toBe(false);
    expect(first.rules.map(rule => rule.key)).toEqual(
      [...first.rules.map(rule => rule.key)].sort((a, b) => a.localeCompare(b))
    );
  });
});
