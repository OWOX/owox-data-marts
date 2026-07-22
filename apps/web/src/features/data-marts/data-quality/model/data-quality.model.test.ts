import { describe, expect, it } from 'vitest';
import {
  dataQualityPollingInterval,
  getDisplayedDataQualityFieldRuleKeys,
  getDataQualityStatusPresentation,
  getSelectableDataQualityFields,
  groupDataQualityFieldRules,
  toStoredDataQualityConfig,
} from './data-quality.model';
import type {
  DataQualityConfig,
  DataQualityRuleConfig,
  EffectiveDataQualityConfig,
  EffectiveDataQualityRuleConfig,
} from './types';

describe('data quality model', () => {
  it('strips server-computed applicability from stored configs', () => {
    const effective: EffectiveDataQualityConfig = {
      timezone: 'Europe/Kyiv',
      rules: [
        {
          key: 'negative_values:field:amount',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldId: 'amount' },
          enabled: false,
          severity: 'warning',
          parameters: {},
          isApplicable: false,
          notApplicableReason: 'Field was removed',
        },
      ],
    };

    expect(toStoredDataQualityConfig(effective)).toEqual({
      timezone: 'Europe/Kyiv',
      rules: [
        {
          key: 'negative_values:field:amount',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldId: 'amount' },
          enabled: false,
          severity: 'warning',
          parameters: {},
        },
      ],
    });
  });

  it('drops legacy table-level freshness from stored configs', () => {
    const effective: EffectiveDataQualityConfig = {
      timezone: 'UTC',
      rules: [
        dataMartRule(),
        {
          key: 'data_freshness:data_mart',
          category: 'data_freshness',
          scope: { type: 'DATA_MART' },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdHours: 24 },
          isApplicable: true,
        },
      ],
    };

    expect(toStoredDataQualityConfig(effective).rules).toEqual([
      expect.objectContaining({ key: 'empty_table:data_mart' }),
    ]);
  });

  it.each([
    ['NEVER_RUN', 'Quality has not been run yet'],
    ['QUEUED', 'Quality run queued'],
    ['RUNNING', 'Quality checks are running'],
    ['PASSED', 'All enabled checks passed'],
    ['ISSUES', 'Quality issues found'],
    ['EXECUTION_FAILED', 'Quality run failed'],
    ['CANCELLED', 'Quality run cancelled'],
    ['ALL_DISABLED', 'All checks are disabled'],
  ] as const)('presents %s', (state, title) => {
    expect(getDataQualityStatusPresentation({ state }).title).toBe(title);
  });

  it('presents an all-not-applicable run independently of execution state', () => {
    expect(
      getDataQualityStatusPresentation({
        state: 'PASSED',
        totalChecks: 3,
        notApplicableChecks: 3,
      }).title
    ).toBe('No checks are applicable');
  });

  it('polls only queued and running runs', () => {
    expect(dataQualityPollingInterval('QUEUED')).toBe(2_000);
    expect(dataQualityPollingInterval('RUNNING')).toBe(2_000);
    expect(dataQualityPollingInterval('PASSED')).toBe(false);
    expect(dataQualityPollingInterval(undefined)).toBe(false);
  });

  it('groups field rules deterministically by field id', () => {
    const rules = [
      fieldRule('null_rate', 'zeta'),
      dataMartRule(),
      fieldRule('negative_values', 'alpha'),
      fieldRule('constant_column', 'zeta'),
    ];

    expect(
      groupDataQualityFieldRules(rules).map(group => ({
        fieldId: group.fieldId,
        ruleKeys: group.rules.map(rule => rule.key),
      }))
    ).toEqual([
      {
        fieldId: 'alpha',
        ruleKeys: ['negative_values:field:alpha'],
      },
      {
        fieldId: 'zeta',
        ruleKeys: ['null_rate:field:zeta', 'constant_column:field:zeta'],
      },
    ]);
  });

  it('displays only field rules enabled in the baseline or draft', () => {
    const baseline = config([
      storedFieldRule('null_rate', 'saved-field', true),
      storedFieldRule('constant_column', 'saved-field', false),
      storedFieldRule('negative_values', 'disabled-field', false),
    ]);
    const draft = config([
      storedFieldRule('null_rate', 'saved-field', false),
      storedFieldRule('negative_values', 'draft-field', true),
      storedFieldRule('constant_column', 'draft-field', false),
      dataMartRule(),
    ]);

    expect(getDisplayedDataQualityFieldRuleKeys(baseline, draft)).toEqual([
      'negative_values:field:draft-field',
      'null_rate:field:saved-field',
    ]);
  });

  it('keeps a stale enabled rule displayed without making it addable', () => {
    const rules = [
      fieldRule('null_rate', 'removed-field', {
        enabled: true,
        isApplicable: false,
      }),
      fieldRule('null_rate', 'current-field', {
        enabled: false,
        isApplicable: true,
      }),
    ];
    const baseline = config([storedFieldRule('null_rate', 'removed-field', true)]);
    const draft = config([storedFieldRule('null_rate', 'removed-field', true)]);
    const displayedRuleKeys = getDisplayedDataQualityFieldRuleKeys(baseline, draft);

    expect(displayedRuleKeys).toEqual(['null_rate:field:removed-field']);
    expect(getSelectableDataQualityFields(rules, displayedRuleKeys)).toEqual([
      {
        id: 'current-field',
        label: 'current-field',
        checks: [{ key: 'null_rate:field:current-field', label: 'Null rate' }],
      },
    ]);
  });

  it('does not make wholly non-applicable fields selectable', () => {
    const rules = [
      fieldRule('null_rate', 'removed-field', { isApplicable: false }),
      fieldRule('constant_column', 'removed-field', { isApplicable: false }),
    ];

    expect(getSelectableDataQualityFields(rules, [])).toEqual([]);
  });

  it('keeps a field selectable while it has another hidden applicable check', () => {
    const rules = [
      fieldRule('null_rate', 'new-field', { enabled: false, isApplicable: true }),
      fieldRule('constant_column', 'new-field', { enabled: false, isApplicable: true }),
      fieldRule('negative_values', 'another-field', { enabled: false, isApplicable: true }),
    ];

    expect(
      getSelectableDataQualityFields(rules, [
        'negative_values:field:another-field',
        'null_rate:field:new-field',
      ])
    ).toEqual([
      {
        id: 'new-field',
        label: 'new-field',
        checks: [
          {
            key: 'constant_column:field:new-field',
            label: 'Constant column',
          },
        ],
      },
    ]);
  });
});

function config(rules: DataQualityRuleConfig[]): DataQualityConfig {
  return { timezone: 'UTC', rules };
}

function dataMartRule(): EffectiveDataQualityRuleConfig {
  return {
    key: 'empty_table:data_mart',
    category: 'empty_table',
    scope: { type: 'DATA_MART' },
    severity: 'error',
    enabled: false,
    parameters: {},
    isApplicable: true,
  };
}

function storedFieldRule(
  category: Extract<
    EffectiveDataQualityRuleConfig['category'],
    'null_rate' | 'negative_values' | 'constant_column'
  >,
  fieldId: string,
  enabled: boolean
): DataQualityRuleConfig {
  const rule = fieldRule(category, fieldId, { enabled });
  return {
    key: rule.key,
    category: rule.category,
    scope: rule.scope,
    severity: rule.severity,
    enabled: rule.enabled,
    parameters: rule.parameters,
  };
}

function fieldRule(
  category: Extract<
    EffectiveDataQualityRuleConfig['category'],
    'null_rate' | 'negative_values' | 'constant_column'
  >,
  fieldId: string,
  overrides: Partial<EffectiveDataQualityRuleConfig> = {}
): EffectiveDataQualityRuleConfig {
  return {
    key: `${category}:field:${fieldId}`,
    category,
    scope: { type: 'FIELD', fieldId },
    severity: 'warning',
    enabled: false,
    parameters: {},
    isApplicable: true,
    ...overrides,
  };
}
