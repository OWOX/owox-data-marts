import { ReportColumnConfigSchema } from './report-column-config.schema';

describe('ReportColumnConfigSchema', () => {
  it('should accept null', () => {
    const result = ReportColumnConfigSchema.parse(null);
    expect(result).toBeNull();
  });

  it('should accept a valid array of strings', () => {
    const input = ['column_a', 'column_b', 'column_c'];
    const result = ReportColumnConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('should accept an empty array (backward compatibility with pre-existing data)', () => {
    const result = ReportColumnConfigSchema.parse([]);
    expect(result).toEqual([]);
  });

  it('should reject an array with empty strings', () => {
    expect(() => ReportColumnConfigSchema.parse(['valid', ''])).toThrow();
  });

  it('should reject undefined', () => {
    expect(() => ReportColumnConfigSchema.parse(undefined)).toThrow();
  });
});
