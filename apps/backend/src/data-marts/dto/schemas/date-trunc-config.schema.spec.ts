import { DateTruncConfigSchema, DateTruncRuleSchema } from './date-trunc-config.schema';

describe('DateTruncConfigSchema', () => {
  it('accepts a rule with a valid unit', () => {
    const result = DateTruncRuleSchema.safeParse({ column: 'date', unit: 'MONTH' });
    expect(result.success).toBe(true);
  });

  it('accepts each supported unit', () => {
    for (const unit of ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']) {
      expect(DateTruncRuleSchema.safeParse({ column: 'date', unit }).success).toBe(true);
    }
  });

  it('rejects an unknown unit', () => {
    expect(DateTruncRuleSchema.safeParse({ column: 'date', unit: 'HOUR' }).success).toBe(false);
  });

  it('rejects an empty column', () => {
    expect(DateTruncRuleSchema.safeParse({ column: '', unit: 'MONTH' }).success).toBe(false);
  });

  it('accepts an array of rules and null', () => {
    expect(DateTruncConfigSchema.safeParse([{ column: 'date', unit: 'YEAR' }]).success).toBe(true);
    expect(DateTruncConfigSchema.safeParse(null).success).toBe(true);
  });

  describe('timeZone', () => {
    it('is optional — a rule with no timeZone is valid', () => {
      expect(DateTruncRuleSchema.safeParse({ column: 'date', unit: 'MONTH' }).success).toBe(true);
    });

    it('accepts valid IANA time zones', () => {
      for (const tz of ['UTC', 'America/New_York', 'Europe/Kyiv', 'Asia/Kolkata', 'Etc/GMT+5']) {
        const result = DateTruncRuleSchema.safeParse({
          column: 'date',
          unit: 'MONTH',
          timeZone: tz,
        });
        expect(result.success).toBe(true);
      }
    });

    // The tz is INLINED into SQL as a literal, so the IANA regex is a hard injection guard.
    it('rejects a SQL-injection payload', () => {
      const result = DateTruncRuleSchema.safeParse({
        column: 'date',
        unit: 'MONTH',
        timeZone: "Foo'; DROP TABLE reports; --",
      });
      expect(result.success).toBe(false);
    });

    it('rejects other non-IANA strings (quotes, spaces, empty)', () => {
      for (const tz of ['', ' ', "America/New'York", 'a b', '/Leading', 'Foo;bar', '">"']) {
        expect(
          DateTruncRuleSchema.safeParse({ column: 'date', unit: 'MONTH', timeZone: tz }).success
        ).toBe(false);
      }
    });
  });
});
