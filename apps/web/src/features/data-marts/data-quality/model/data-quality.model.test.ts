import { describe, expect, it } from 'vitest';
import {
  dataQualityPollingInterval,
  getDataQualityStatusPresentation,
  toStoredDataQualityConfig,
} from './data-quality.model';
import type { EffectiveDataQualityConfig } from './types';

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
});
