import { describe, it, expect } from 'vitest';
import { DateTruncRuleSchema, EMPTY_OUTPUT_CONFIG, hasAnyOutputControls } from './output-config';

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
