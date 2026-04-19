import {
  JoinConditionsSchema,
  JoinConditionsUpdateSchema,
  ReportColumnConfigSchema,
} from './relationship-schemas';

describe('JoinConditionsSchema', () => {
  it('should accept a valid array of join conditions', () => {
    const input = [{ sourceFieldName: 'user_id', targetFieldName: 'id' }];
    const result = JoinConditionsSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('should accept multiple join conditions', () => {
    const input = [
      { sourceFieldName: 'user_id', targetFieldName: 'id' },
      { sourceFieldName: 'project_id', targetFieldName: 'project_id' },
    ];
    const result = JoinConditionsSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('should accept an empty array (draft state)', () => {
    expect(JoinConditionsSchema.parse([])).toEqual([]);
  });

  it('should reject empty sourceFieldName', () => {
    const input = [{ sourceFieldName: '', targetFieldName: 'id' }];
    expect(() => JoinConditionsSchema.parse(input)).toThrow();
  });

  it('should reject empty targetFieldName', () => {
    const input = [{ sourceFieldName: 'user_id', targetFieldName: '' }];
    expect(() => JoinConditionsSchema.parse(input)).toThrow();
  });

  it('should reject missing required fields', () => {
    const input = [{ sourceFieldName: 'user_id' }];
    expect(() => JoinConditionsSchema.parse(input)).toThrow();
  });
});

describe('JoinConditionsUpdateSchema', () => {
  it('should accept a valid array of join conditions', () => {
    const input = [{ sourceFieldName: 'user_id', targetFieldName: 'id' }];
    const result = JoinConditionsUpdateSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('should reject an empty array', () => {
    expect(() => JoinConditionsUpdateSchema.parse([])).toThrow();
  });

  it('should reject empty sourceFieldName', () => {
    const input = [{ sourceFieldName: '', targetFieldName: 'id' }];
    expect(() => JoinConditionsUpdateSchema.parse(input)).toThrow();
  });

  it('should reject empty targetFieldName', () => {
    const input = [{ sourceFieldName: 'user_id', targetFieldName: '' }];
    expect(() => JoinConditionsUpdateSchema.parse(input)).toThrow();
  });
});

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

  it('should reject an empty array', () => {
    expect(() => ReportColumnConfigSchema.parse([])).toThrow();
  });

  it('should reject an array with empty strings', () => {
    expect(() => ReportColumnConfigSchema.parse(['valid', ''])).toThrow();
  });

  it('should reject undefined', () => {
    expect(() => ReportColumnConfigSchema.parse(undefined)).toThrow();
  });
});
