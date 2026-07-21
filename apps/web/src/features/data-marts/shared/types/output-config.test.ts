import { describe, it, expect } from 'vitest';
import {
  DateTruncRuleSchema,
  EMPTY_OUTPUT_CONFIG,
  FilterRuleSchema,
  hasAnyOutputControls,
} from './output-config';

describe('FilterRuleSchema — in/not_in (backend mirror)', () => {
  it('parses in/not_in rules created via MCP or the API', () => {
    expect(
      FilterRuleSchema.safeParse({ column: 'channel', operator: 'in', value: ['fb', 'google'] })
        .success
    ).toBe(true);
    expect(
      FilterRuleSchema.safeParse({
        column: 'amount',
        operator: 'not_in',
        value: [1, 2],
        placement: 'post-join',
      }).success
    ).toBe(true);
  });

  it('rejects an in rule with an empty or scalar value', () => {
    expect(FilterRuleSchema.safeParse({ column: 'c', operator: 'in', value: [] }).success).toBe(
      false
    );
    expect(FilterRuleSchema.safeParse({ column: 'c', operator: 'in', value: 'fb' }).success).toBe(
      false
    );
  });
});

describe('uniqueCountConfig — EMPTY_OUTPUT_CONFIG and hasAnyOutputControls', () => {
  it('EMPTY_OUTPUT_CONFIG.uniqueCountConfig is false', () => {
    expect(EMPTY_OUTPUT_CONFIG.uniqueCountConfig).toBe(false);
  });

  it('hasAnyOutputControls returns false when only uniqueCountConfig is false', () => {
    expect(hasAnyOutputControls(EMPTY_OUTPUT_CONFIG)).toBe(false);
  });

  it('hasAnyOutputControls returns true when only uniqueCountConfig is true', () => {
    expect(hasAnyOutputControls({ ...EMPTY_OUTPUT_CONFIG, uniqueCountConfig: true })).toBe(true);
  });
});

describe('DateTruncRuleSchema — timeZone', () => {
  it('accepts a rule without a timeZone', () => {
    expect(DateTruncRuleSchema.safeParse({ column: 'date', unit: 'MONTH' }).success).toBe(true);
  });

  it('accepts a valid IANA timeZone', () => {
    for (const timeZone of ['UTC', 'America/New_York', 'Europe/Kyiv', 'Etc/GMT+5']) {
      expect(
        DateTruncRuleSchema.safeParse({ column: 'date', unit: 'MONTH', timeZone }).success
      ).toBe(true);
    }
  });

  // The tz is inlined into SQL on the backend, so the FE mirror guards the same shape.
  it('rejects a SQL-injection payload', () => {
    expect(
      DateTruncRuleSchema.safeParse({
        column: 'date',
        unit: 'MONTH',
        timeZone: "Foo'; DROP TABLE reports; --",
      }).success
    ).toBe(false);
  });
});
