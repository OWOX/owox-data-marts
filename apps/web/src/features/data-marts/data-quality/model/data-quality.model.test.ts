import { describe, expect, it } from 'vitest';
import {
  dataQualityPollingInterval,
  getDisplayedDataQualityFieldRuleKeys,
  getDataQualityStatusPresentation,
  getSelectableDataQualityFields,
  groupDataQualityFieldRules,
  sortDataQualityResults,
  toStoredDataQualityConfig,
} from './data-quality.model';
import type {
  DataQualityCheckResult,
  DataQualityConfig,
  DataQualityRuleConfig,
  EffectiveDataQualityConfig,
  EffectiveDataQualityRuleConfig,
} from './types';

describe('data quality model', () => {
  it('strips server-computed applicability from stored configs', () => {
    const effective: EffectiveDataQualityConfig = {
      rules: [
        {
          key: 'negative_values:field:["amount"]',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldPath: ['amount'] },
          enabled: false,
          severity: 'warning',
          parameters: {},
          isApplicable: false,
          notApplicableReason: 'Field was removed',
        },
      ],
    };

    expect(toStoredDataQualityConfig(effective)).toEqual({
      rules: [
        {
          key: 'negative_values:field:["amount"]',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldPath: ['amount'] },
          enabled: false,
          severity: 'warning',
          parameters: {},
        },
      ],
    });
  });

  it('deep-clones field paths when creating stored configuration', () => {
    const effectiveRule = fieldRule('null_rate', ['customer', 'id']);
    const stored = toStoredDataQualityConfig({ rules: [effectiveRule] });
    if (stored.rules[0].scope.type !== 'FIELD' || effectiveRule.scope.type !== 'FIELD') {
      throw new Error('Expected field scopes');
    }

    expect(stored.rules[0].scope.fieldPath).toEqual(['customer', 'id']);
    expect(stored.rules[0].scope.fieldPath).not.toBe(effectiveRule.scope.fieldPath);
  });

  it.each([
    ['NEVER_RUN', 'No runs yet'],
    ['QUEUED', 'Run queued…'],
    ['RUNNING', 'Running checks…'],
    ['PASSED', 'All checks passed'],
    ['ISSUES', 'Issues found'],
    ['EXECUTION_FAILED', 'Execution failed'],
    ['CANCELLED', 'Run cancelled'],
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

  it('groups field rules deterministically by segmented field path', () => {
    const rules = [
      fieldRule('null_rate', 'zeta'),
      dataMartRule(),
      fieldRule('negative_values', 'alpha'),
      fieldRule('constant_column', 'zeta'),
    ];

    expect(
      groupDataQualityFieldRules(rules).map(group => ({
        fieldPath: group.fieldPath,
        fieldPathKey: group.fieldPathKey,
        ruleKeys: group.rules.map(rule => rule.key),
      }))
    ).toEqual([
      {
        fieldPath: ['alpha'],
        fieldPathKey: '["alpha"]',
        ruleKeys: ['negative_values:field:["alpha"]'],
      },
      {
        fieldPath: ['zeta'],
        fieldPathKey: '["zeta"]',
        ruleKeys: ['null_rate:field:["zeta"]', 'constant_column:field:["zeta"]'],
      },
    ]);
  });

  it('keeps literal dotted and segmented nested paths as separate picker identities', () => {
    const rules = [
      fieldRule('null_rate', ['customer.id']),
      fieldRule('null_rate', ['customer', 'id']),
    ];

    expect(
      getSelectableDataQualityFields(rules, []).map(field => ({
        fieldPath: field.fieldPath,
        fieldPathKey: field.fieldPathKey,
        label: field.label,
      }))
    ).toEqual([
      {
        fieldPath: ['customer.id'],
        fieldPathKey: '["customer.id"]',
        label: 'customer.id',
      },
      {
        fieldPath: ['customer', 'id'],
        fieldPathKey: '["customer","id"]',
        label: 'customer.id',
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
      'negative_values:field:["draft-field"]',
      'null_rate:field:["saved-field"]',
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

    expect(displayedRuleKeys).toEqual(['null_rate:field:["removed-field"]']);
    expect(getSelectableDataQualityFields(rules, displayedRuleKeys)).toEqual([
      {
        fieldPath: ['current-field'],
        fieldPathKey: '["current-field"]',
        label: 'current-field',
        checks: [
          {
            key: 'null_rate:field:["current-field"]',
            label: 'Null rate',
            description:
              'Checks whether the share of null values exceeds the configured threshold.',
            isAdded: false,
          },
        ],
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
        'negative_values:field:["another-field"]',
        'null_rate:field:["new-field"]',
      ])
    ).toEqual([
      {
        fieldPath: ['new-field'],
        fieldPathKey: '["new-field"]',
        label: 'new-field',
        checks: [
          {
            key: 'null_rate:field:["new-field"]',
            label: 'Null rate',
            description:
              'Checks whether the share of null values exceeds the configured threshold.',
            isAdded: true,
          },
          {
            key: 'constant_column:field:["new-field"]',
            label: 'Constant column',
            description: 'Finds fields that contain only one distinct value.',
            isAdded: false,
          },
        ],
      },
    ]);
  });

  it('sorts results by execution errors, finding severity, passed, then not applicable', () => {
    const results = [
      result('not-applicable', 'NOT_APPLICABLE', 'error'),
      result('passed', 'PASSED', 'error'),
      result('notice', 'FAILED', 'notice'),
      result('execution-error', 'ERROR', 'warning'),
      result('warning', 'FAILED', 'warning'),
      result('critical', 'FAILED', 'error'),
    ];

    expect(sortDataQualityResults(results).map(item => item.id)).toEqual([
      'execution-error',
      'critical',
      'warning',
      'notice',
      'passed',
      'not-applicable',
    ]);
    expect(results.map(item => item.id)).toEqual([
      'not-applicable',
      'passed',
      'notice',
      'execution-error',
      'warning',
      'critical',
    ]);
  });
});

function result(
  id: string,
  status: DataQualityCheckResult['status'],
  severity: DataQualityCheckResult['severity']
): DataQualityCheckResult {
  return {
    id,
    ruleKey: id,
    category: 'empty_table',
    scope: { type: 'DATA_MART' },
    severity,
    status,
    violationCount: status === 'FAILED' ? 1 : 0,
    description: id,
    examples: [],
    sql: null,
    error: status === 'ERROR' ? { code: null, message: 'failed', details: null } : null,
    redacted: false,
  };
}

function config(rules: DataQualityRuleConfig[]): DataQualityConfig {
  return { rules };
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
  fieldPath: string | string[],
  enabled: boolean
): DataQualityRuleConfig {
  const rule = fieldRule(category, fieldPath, { enabled });
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
  fieldPath: string | string[],
  overrides: Partial<EffectiveDataQualityRuleConfig> = {}
): EffectiveDataQualityRuleConfig {
  const normalizedPath = typeof fieldPath === 'string' ? [fieldPath] : fieldPath;
  return {
    key: `${category}:field:${JSON.stringify(normalizedPath)}`,
    category,
    scope: { type: 'FIELD', fieldPath: normalizedPath },
    severity: 'warning',
    enabled: false,
    parameters: {},
    isApplicable: true,
    ...overrides,
  };
}
