import {
  JoinConditionsSchema,
  BlendedFieldsSchema,
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

  it('should reject an empty array', () => {
    expect(() => JoinConditionsSchema.parse([])).toThrow();
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

describe('BlendedFieldsSchema', () => {
  it('should apply default isHidden=false', () => {
    const input = [{ targetFieldName: 'name', outputAlias: 'display_name' }];
    const result = BlendedFieldsSchema.parse(input);
    expect(result[0].isHidden).toBe(false);
  });

  it('should apply default aggregateFunction=STRING_AGG', () => {
    const input = [{ targetFieldName: 'name', outputAlias: 'display_name' }];
    const result = BlendedFieldsSchema.parse(input);
    expect(result[0].aggregateFunction).toBe('STRING_AGG');
  });

  it('should accept explicit isHidden=true', () => {
    const input = [{ targetFieldName: 'name', outputAlias: 'display_name', isHidden: true }];
    const result = BlendedFieldsSchema.parse(input);
    expect(result[0].isHidden).toBe(true);
  });

  it('should accept all valid aggregate functions', () => {
    const aggregateFunctions = ['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'] as const;
    for (const fn of aggregateFunctions) {
      const input = [{ targetFieldName: 'value', outputAlias: 'result', aggregateFunction: fn }];
      const result = BlendedFieldsSchema.parse(input);
      expect(result[0].aggregateFunction).toBe(fn);
    }
  });

  it('should reject an invalid aggregate function', () => {
    const input = [
      { targetFieldName: 'name', outputAlias: 'display_name', aggregateFunction: 'AVG' },
    ];
    expect(() => BlendedFieldsSchema.parse(input)).toThrow();
  });

  it('should accept an empty array', () => {
    expect(BlendedFieldsSchema.parse([])).toEqual([]);
  });

  it('should reject empty targetFieldName', () => {
    const input = [{ targetFieldName: '', outputAlias: 'display_name' }];
    expect(() => BlendedFieldsSchema.parse(input)).toThrow();
  });

  it('should reject empty outputAlias', () => {
    const input = [{ targetFieldName: 'name', outputAlias: '' }];
    expect(() => BlendedFieldsSchema.parse(input)).toThrow();
  });

  it('should accept multiple blended field configs', () => {
    const input = [
      { targetFieldName: 'name', outputAlias: 'display_name', isHidden: false },
      { targetFieldName: 'value', outputAlias: 'total', aggregateFunction: 'SUM' as const },
    ];
    const result = BlendedFieldsSchema.parse(input);
    expect(result).toHaveLength(2);
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
