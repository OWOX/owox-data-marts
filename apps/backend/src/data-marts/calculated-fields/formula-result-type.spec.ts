import type { CalculatedSchemaField } from './calculated-field.utils';
import { applyResultTypes } from './formula-result-type';

describe('applyResultTypes', () => {
  const field = (type: string) =>
    ({
      name: 'flag',
      type,
      calculated: { formula: 'x', level: 'row' },
    }) as unknown as CalculatedSchemaField;
  const run = (
    declared: string,
    result: string | undefined,
    changed: ReadonlySet<string> = new Set(['flag'])
  ) => {
    const f = field(declared);
    const resultTypes = result === undefined ? undefined : new Map([['flag', result]]);
    const warnings = applyResultTypes([f], resultTypes, changed);
    return { type: f.type, warnings };
  };

  it('sets the result type and warns', () => {
    expect(run('STRING', 'BOOLEAN')).toEqual({
      type: 'BOOLEAN',
      warnings: [
        {
          code: 'FORMULA_TYPE_SET_FROM_RESULT',
          field: 'flag',
          message:
            'The formula of `flag` returns BOOLEAN, but its type was STRING. OWOX changed the type to BOOLEAN.',
        },
      ],
    });
  });

  it.each([
    ['DATE', 'TIMESTAMP'],
    ['INTEGER', 'STRING'],
    ['STRING', 'FLOAT'],
    ['STRING', 'INTEGER'],
    ['BOOLEAN', 'NUMERIC'],
    ['FLOAT', 'BOOLEAN'],
    ['NUMERIC', 'DATE'],
  ])('changes %s to %s', (declared, result) => {
    const r = run(declared, result);
    expect(r.type).toBe(result);
    expect(r.warnings).toHaveLength(1);
  });

  it.each([
    ['INTEGER', 'FLOAT'],
    ['NUMERIC', 'INTEGER'],
    ['FLOAT', 'STRING'],
    ['NUMERIC', 'STRING'],
    ['BIGNUMERIC', 'STRING'],
    ['STRING', 'BYTES'],
    ['STRING', 'JSON'],
    ['STRING', 'GEOGRAPHY'],
    ['BOOLEAN', 'BOOLEAN'],
  ])('keeps %s when the result is %s', (declared, result) => {
    expect(run(declared, result)).toEqual({ type: declared, warnings: [] });
  });

  it('changes nothing without a result type or for an unchanged field', () => {
    expect(run('STRING', undefined)).toEqual({ type: 'STRING', warnings: [] });
    const f = field('STRING');
    expect(applyResultTypes([f], new Map([['other', 'BOOLEAN']]), new Set(['flag']))).toEqual([]);
    expect(applyResultTypes([f], new Map([['flag', 'BOOLEAN']]), new Set())).toEqual([]);
    expect(f.type).toBe('STRING');
  });

  describe('allowed aggregations', () => {
    const withAggs = (type: string, allowedAggregations: string[], result: string) => {
      const f = { ...field(type), allowedAggregations } as unknown as CalculatedSchemaField;
      applyResultTypes([f], new Map([['flag', result]]), new Set(['flag']));
      return f.allowedAggregations;
    };

    it('drops a non-empty set when the category changes', () => {
      expect(withAggs('STRING', ['COUNT', 'COUNT_DISTINCT'], 'INTEGER')).toBeUndefined();
    });

    it('keeps the set when the category stays', () => {
      expect(withAggs('DATE', ['MIN', 'MAX'], 'TIMESTAMP')).toEqual(['MIN', 'MAX']);
      expect(withAggs('INTEGER', ['SUM'], 'FLOAT')).toEqual(['SUM']);
    });

    it('keeps an explicit empty set', () => {
      expect(withAggs('STRING', [], 'INTEGER')).toEqual([]);
    });
  });
});
