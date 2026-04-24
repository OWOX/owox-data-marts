import { JoinConditionsSchema } from './join-condition.schema';

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
