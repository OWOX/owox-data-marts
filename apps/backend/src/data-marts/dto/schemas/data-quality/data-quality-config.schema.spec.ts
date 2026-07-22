import { DataQualityCategory } from '../../../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../../../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../../../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../../../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../../../enums/data-quality-summary-state.enum';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import { DataMartRunType } from '../../../enums/data-mart-run-type.enum';
import {
  DataQualityConfigSchema,
  buildDataQualityRuleKey,
  createAllDisabledDataQualityConfig,
} from './data-quality-config.schema';
import * as DataQualityConfigContracts from './data-quality-config.schema';
import {
  DataQualityCheckResultSchema,
  DataQualityResultExampleSchema,
  DataQualityRunSnapshotSchema,
  DataQualitySummarySchema,
} from './data-quality-run.schema';

describe('data quality enums', () => {
  it('defines all data quality categories', () => {
    expect(Object.values(DataQualityCategory)).toEqual([
      'pk_uniqueness',
      'duplicate_rows',
      'null_rate',
      'column_uniqueness',
      'constant_column',
      'empty_table',
      'type_mismatch',
      'data_freshness',
      'future_values',
      'negative_values',
      'relationship_integrity',
      'reverse_relationship',
    ]);
  });

  it('defines every severity, check status, summary state, and scope', () => {
    expect(Object.values(DataQualitySeverity)).toEqual(['notice', 'warning', 'error']);
    expect(Object.values(DataQualityCheckStatus)).toEqual([
      'PASSED',
      'FAILED',
      'NOT_APPLICABLE',
      'ERROR',
    ]);
    expect(Object.values(DataQualitySummaryState)).toEqual([
      'NEVER_RUN',
      'QUEUED',
      'RUNNING',
      'PASSED',
      'ISSUES',
      'EXECUTION_FAILED',
      'CANCELLED',
      'ALL_DISABLED',
    ]);
    expect(Object.values(DataQualityScope)).toEqual(['DATA_MART', 'FIELD', 'RELATIONSHIP']);
  });

  it('registers data quality as a data mart run type', () => {
    expect(DataMartRunType.DATA_QUALITY).toBe('DATA_QUALITY');
  });
});

describe('DataQualityConfigSchema', () => {
  it('uses DATA_MART as the public data-mart scope contract', () => {
    const scopes = DataQualityScope as unknown as Record<string, string>;

    expect(scopes.DATA_MART).toBe('DATA_MART');
    expect(scopes.TABLE).toBeUndefined();
  });

  const tableRule = {
    key: 'empty_table:data_mart',
    category: DataQualityCategory.EMPTY_TABLE,
    scope: { type: DataQualityScope.DATA_MART },
    severity: DataQualitySeverity.ERROR,
    enabled: true,
    parameters: {},
  };

  const parseRules = (rules: unknown[], timezone = 'UTC') =>
    DataQualityConfigSchema.parse({ timezone, rules });

  it('keeps stored config free of computed applicability fields', () => {
    expect(parseRules([tableRule]).rules[0]).toEqual(tableRule);
    expect(() =>
      parseRules([{ ...tableRule, isApplicable: true, notApplicableReason: 'computed' }])
    ).toThrow();
  });

  it('exposes a separate effective config contract with computed applicability', () => {
    const effectiveSchema = (
      DataQualityConfigContracts as typeof DataQualityConfigContracts & {
        EffectiveDataQualityConfigSchema?: typeof DataQualityConfigSchema;
      }
    ).EffectiveDataQualityConfigSchema;

    expect(effectiveSchema).toBeDefined();
    expect(
      effectiveSchema?.parse({
        timezone: 'UTC',
        rules: [{ ...tableRule, isApplicable: false, notApplicableReason: 'stale field' }],
      }).rules[0]
    ).toMatchObject({ isApplicable: false, notApplicableReason: 'stale field' });
  });

  it('accepts valid IANA timezones', () => {
    expect(parseRules([tableRule], 'UTC').timezone).toBe('UTC');
    expect(parseRules([tableRule], 'Europe/Kyiv').timezone).toBe('Europe/Kyiv');
  });

  it('accepts notice severity in config and persisted result contracts', () => {
    const noticeRule = { ...tableRule, severity: DataQualitySeverity.NOTICE };
    expect(parseRules([noticeRule]).rules[0].severity).toBe('notice');

    expect(
      DataQualityCheckResultSchema.parse({
        id: 'result-1',
        ruleKey: noticeRule.key,
        category: noticeRule.category,
        scope: noticeRule.scope,
        severity: DataQualitySeverity.NOTICE,
        status: DataQualityCheckStatus.FAILED,
        violationCount: 1,
        description: 'One informational issue was found',
        examples: [],
        executedSql: ['SELECT 1'],
        reproductionSql: null,
        error: null,
      }).severity
    ).toBe('notice');
  });

  it('rejects invalid timezones', () => {
    expect(() => parseRules([], 'not/a_timezone')).toThrow();
  });

  it('requires unique, stable rule keys', () => {
    expect(() => parseRules([tableRule, tableRule])).toThrow(/unique/i);
    expect(() => parseRules([{ ...tableRule, key: 'user-defined-key' }])).toThrow(/stable/i);
  });

  it('validates category and scope compatibility', () => {
    const invalid = {
      ...tableRule,
      key: 'empty_table:field:customer_id',
      scope: { type: DataQualityScope.FIELD, fieldId: 'customer_id' },
    };
    expect(() => parseRules([invalid])).toThrow(/scope/i);

    const tableFreshness = {
      ...tableRule,
      key: 'data_freshness:data_mart',
      category: DataQualityCategory.DATA_FRESHNESS,
      parameters: { thresholdHours: 24 },
    };
    const fieldFreshness = {
      ...tableFreshness,
      key: 'data_freshness:field:updated_at',
      scope: { type: DataQualityScope.FIELD, fieldId: 'updated_at' },
    };
    expect(() => parseRules([tableFreshness])).toThrow(/scope/i);
    expect(parseRules([fieldFreshness]).rules).toEqual([fieldFreshness]);
  });

  it('validates field and relationship identifiers', () => {
    const invalidField = {
      ...tableRule,
      key: 'null_rate:field:',
      category: DataQualityCategory.NULL_RATE,
      scope: { type: DataQualityScope.FIELD, fieldId: '' },
      parameters: { thresholdPercent: 0 },
    };
    const invalidRelationship = {
      ...tableRule,
      key: 'relationship_integrity:relationship:',
      category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
      scope: { type: DataQualityScope.RELATIONSHIP, relationshipId: '   ' },
    };
    expect(() => parseRules([invalidField])).toThrow();
    expect(() => parseRules([invalidRelationship])).toThrow();
  });

  it('accepts provider-valid long field paths and their stable rule keys', () => {
    const fieldId = `${'nested_field.'.repeat(50)}leaf`;
    const rule = {
      ...tableRule,
      key: `null_rate:field:${fieldId}`,
      category: DataQualityCategory.NULL_RATE,
      scope: { type: DataQualityScope.FIELD, fieldId },
      parameters: { thresholdPercent: 0 },
    };

    expect(parseRules([rule]).rules[0]).toEqual(rule);
    expect(
      DataQualityCheckResultSchema.parse({
        id: 'result-1',
        ruleKey: rule.key,
        category: rule.category,
        scope: rule.scope,
        severity: DataQualitySeverity.ERROR,
        status: DataQualityCheckStatus.PASSED,
        violationCount: 0,
        description: 'No null values',
        examples: [],
        executedSql: ['SELECT 1'],
        reproductionSql: null,
        error: null,
      }).ruleKey
    ).toBe(rule.key);
  });

  it.each([0, 25.5, 100])('accepts thresholdPercent boundary value %p', thresholdPercent => {
    const rule = {
      ...tableRule,
      key: 'null_rate:field:amount',
      category: DataQualityCategory.NULL_RATE,
      scope: { type: DataQualityScope.FIELD, fieldId: 'amount' },
      parameters: { thresholdPercent },
    };
    expect(parseRules([rule]).rules[0].parameters.thresholdPercent).toBe(thresholdPercent);
  });

  it.each([-0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid thresholdPercent %p',
    thresholdPercent => {
      const rule = {
        ...tableRule,
        key: 'null_rate:field:amount',
        category: DataQualityCategory.NULL_RATE,
        scope: { type: DataQualityScope.FIELD, fieldId: 'amount' },
        parameters: { thresholdPercent },
      };
      expect(() => parseRules([rule])).toThrow();
    }
  );

  it('requires thresholdPercent on every null_rate rule, including disabled rules', () => {
    const rule = {
      ...tableRule,
      key: 'null_rate:field:amount',
      category: DataQualityCategory.NULL_RATE,
      scope: { type: DataQualityScope.FIELD, fieldId: 'amount' },
      enabled: false,
      parameters: {},
    };

    expect(() => parseRules([rule])).toThrow(/thresholdPercent/);
  });

  it.each([0, 0.5, 24])('accepts thresholdHours boundary value %p', thresholdHours => {
    const rule = {
      ...tableRule,
      key: 'data_freshness:field:updated_at',
      category: DataQualityCategory.DATA_FRESHNESS,
      scope: { type: DataQualityScope.FIELD, fieldId: 'updated_at' },
      parameters: { thresholdHours },
    };
    expect(parseRules([rule]).rules[0].parameters.thresholdHours).toBe(thresholdHours);
  });

  it.each([-0.01, Number.NaN, Number.NEGATIVE_INFINITY])(
    'rejects invalid thresholdHours %p',
    thresholdHours => {
      const rule = {
        ...tableRule,
        key: 'data_freshness:field:updated_at',
        category: DataQualityCategory.DATA_FRESHNESS,
        scope: { type: DataQualityScope.FIELD, fieldId: 'updated_at' },
        parameters: { thresholdHours },
      };
      expect(() => parseRules([rule])).toThrow();
    }
  );

  it('requires thresholdHours on every data_freshness rule, including disabled rules', () => {
    const rule = {
      ...tableRule,
      key: 'data_freshness:field:updated_at',
      category: DataQualityCategory.DATA_FRESHNESS,
      scope: { type: DataQualityScope.FIELD, fieldId: 'updated_at' },
      enabled: false,
      parameters: {},
    };

    expect(() => parseRules([rule])).toThrow(/thresholdHours/);
  });

  it.each([1e308, Number.MAX_VALUE])(
    'rejects thresholdHours values that cannot be converted to a safe SQL interval: %p',
    thresholdHours => {
      const rule = {
        ...tableRule,
        key: 'data_freshness:field:updated_at',
        category: DataQualityCategory.DATA_FRESHNESS,
        scope: { type: DataQualityScope.FIELD, fieldId: 'updated_at' },
        parameters: { thresholdHours },
      };

      expect(() => parseRules([rule])).toThrow(/thresholdHours|safe|maximum/i);
    }
  );

  it('rejects threshold parameters on incompatible categories', () => {
    expect(() => parseRules([{ ...tableRule, parameters: { thresholdPercent: 10 } }])).toThrow(
      /thresholdPercent/
    );
    expect(() => parseRules([{ ...tableRule, parameters: { thresholdHours: 10 } }])).toThrow(
      /thresholdHours/
    );
  });

  it('builds stable keys from category and scope', () => {
    expect(
      buildDataQualityRuleKey(DataQualityCategory.EMPTY_TABLE, {
        type: DataQualityScope.DATA_MART,
      })
    ).toBe('empty_table:data_mart');
    expect(
      buildDataQualityRuleKey(DataQualityCategory.NULL_RATE, {
        type: DataQualityScope.FIELD,
        fieldId: 'customer.id',
      })
    ).toBe('null_rate:field:customer.id');
    expect(
      buildDataQualityRuleKey(DataQualityCategory.RELATIONSHIP_INTEGRITY, {
        type: DataQualityScope.RELATIONSHIP,
        relationshipId: 'rel-1',
      })
    ).toBe('relationship_integrity:relationship:rel-1');
  });

  it('creates an explicit all-disabled full override', () => {
    expect(createAllDisabledDataQualityConfig()).toEqual({
      timezone: 'UTC',
      rules: [],
    });
  });
});

describe('data quality run schemas', () => {
  it('serializes result examples without losing JSON values', () => {
    const example = {
      values: { id: 7, email: null, nested: { country: 'UA' } },
    };
    expect(DataQualityResultExampleSchema.parse(example)).toEqual(example);
  });

  it('counts notice findings in the persisted summary contract', () => {
    const summary = {
      state: DataQualitySummaryState.ISSUES,
      enabledChecks: 1,
      totalChecks: 1,
      passedChecks: 0,
      failedChecks: 1,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 1,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 1,
      highestSeverity: DataQualitySeverity.NOTICE,
    };

    expect(DataQualitySummarySchema.parse(summary)).toEqual(summary);
  });

  it('validates summaries and immutable run snapshots', () => {
    const summary = {
      state: DataQualitySummaryState.ISSUES,
      enabledChecks: 4,
      totalChecks: 4,
      passedChecks: 1,
      failedChecks: 2,
      notApplicableChecks: 0,
      errorChecks: 1,
      noticeFindings: 0,
      warningFindings: 1,
      errorFindings: 1,
      violationCount: 3,
      highestSeverity: DataQualitySeverity.ERROR,
    };
    expect(DataQualitySummarySchema.parse(summary)).toEqual(summary);

    const snapshot = {
      config: createAllDisabledDataQualityConfig(),
      schema: null,
      relationships: [
        {
          id: 'rel-1',
          sourceDataMartId: 'dm-1',
          targetDataMartId: 'dm-2',
          targetAlias: 'customers',
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
        },
      ],
      timezone: 'UTC',
      definitionType: DataMartDefinitionType.TABLE,
    };
    expect(DataQualityRunSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});
