import { createDataQualityConfigRevision } from './data-quality-config-revision';

describe('createDataQualityConfigRevision', () => {
  const input = {
    effectiveConfig: {
      rules: [
        {
          key: 'empty_table:data_mart',
          category: 'empty_table',
          scope: { type: 'DATA_MART' },
          severity: 'error',
          enabled: true,
          parameters: {},
          isApplicable: true,
        },
        {
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: false,
          parameters: { thresholdPercent: 0 },
          isApplicable: true,
        },
      ],
    },
    schema: {
      type: 'bigquery-data-mart-schema',
      fields: [{ name: 'email', type: 'STRING', status: 'CONNECTED' }],
    },
    relationships: [
      {
        id: 'relationship-1',
        sourceDataMartId: 'data-mart-1',
        targetDataMartId: 'data-mart-2',
        targetAlias: 'customers',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
    ],
  };

  it('is stable across object-key order and returns lower-case SHA-256 hex', () => {
    const reordered = {
      relationships: [
        {
          joinConditions: [{ targetFieldName: 'id', sourceFieldName: 'customer_id' }],
          targetAlias: 'customers',
          targetDataMartId: 'data-mart-2',
          sourceDataMartId: 'data-mart-1',
          id: 'relationship-1',
        },
      ],
      schema: {
        fields: [{ status: 'CONNECTED', type: 'STRING', name: 'email' }],
        type: 'bigquery-data-mart-schema',
      },
      effectiveConfig: {
        rules: input.effectiveConfig.rules.map(rule => ({
          isApplicable: rule.isApplicable,
          parameters: rule.parameters,
          enabled: rule.enabled,
          severity: rule.severity,
          scope: rule.scope,
          category: rule.category,
          key: rule.key,
        })),
      },
    };

    const revision = createDataQualityConfigRevision(input);

    expect(revision).toMatch(/^[0-9a-f]{64}$/);
    expect(createDataQualityConfigRevision(reordered)).toBe(revision);
  });

  it.each([
    [
      'rule order',
      {
        ...input,
        effectiveConfig: { rules: [...input.effectiveConfig.rules].reverse() },
      },
    ],
    [
      'config values',
      {
        ...input,
        effectiveConfig: {
          rules: input.effectiveConfig.rules.map((rule, index) =>
            index === 0 ? { ...rule, enabled: false } : rule
          ),
        },
      },
    ],
    [
      'schema applicability',
      {
        ...input,
        schema: {
          ...input.schema,
          fields: [{ ...input.schema.fields[0], status: 'DISCONNECTED' }],
        },
      },
    ],
    [
      'relationship alias',
      {
        ...input,
        relationships: [{ ...input.relationships[0], targetAlias: 'customer_accounts' }],
      },
    ],
    [
      'relationship join mapping',
      {
        ...input,
        relationships: [
          {
            ...input.relationships[0],
            joinConditions: [{ sourceFieldName: 'account_id', targetFieldName: 'id' }],
          },
        ],
      },
    ],
  ])('changes when %s changes', (_name, changed) => {
    expect(createDataQualityConfigRevision(changed)).not.toBe(
      createDataQualityConfigRevision(input)
    );
  });
});
