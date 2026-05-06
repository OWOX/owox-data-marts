import { FilterConfigSchema } from './filter-config.schema';

describe('FilterConfigSchema', () => {
  it('accepts null', () => {
    expect(FilterConfigSchema.parse(null)).toBeNull();
  });

  it('accepts empty array', () => {
    expect(FilterConfigSchema.parse([])).toEqual([]);
  });

  it('accepts scalar-operator filter (eq with string value)', () => {
    const input = [{ column: 'name', operator: 'eq', value: 'John' }];
    expect(FilterConfigSchema.parse(input)).toEqual(input);
  });

  it('accepts no-value-operator filter (is_empty)', () => {
    const input = [{ column: 'email', operator: 'is_empty' }];
    expect(FilterConfigSchema.parse(input)).toEqual(input);
  });

  it('accepts between filter with from/to', () => {
    const input = [{ column: 'amount', operator: 'between', value: { from: 1, to: 100 } }];
    expect(FilterConfigSchema.parse(input)).toEqual(input);
  });

  it('accepts relative_date filter (last_n_days)', () => {
    const input = [
      { column: 'created_at', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
    ];
    expect(FilterConfigSchema.parse(input)).toEqual(input);
  });

  it('rejects empty column', () => {
    expect(() => FilterConfigSchema.parse([{ column: '', operator: 'eq', value: 'x' }])).toThrow();
  });

  it('rejects between with scalar value (operator-vs-shape mismatch)', () => {
    expect(() =>
      FilterConfigSchema.parse([{ column: 'amount', operator: 'between', value: 5 }])
    ).toThrow();
  });

  it('rejects unknown operator', () => {
    expect(() => FilterConfigSchema.parse([{ column: 'x', operator: 'foo', value: 1 }])).toThrow();
  });

  it('rejects relative_date with negative n', () => {
    expect(() =>
      FilterConfigSchema.parse([
        { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: -1 } },
      ])
    ).toThrow();
  });
});
