import { FilterConfigSchema, FilterRuleSchema, aliasPathToCteName } from './filter-config.schema';

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

  it('accepts is_null and is_not_null no-value operators', () => {
    expect(FilterConfigSchema.parse([{ column: 'd', operator: 'is_null' }])).toEqual([
      { column: 'd', operator: 'is_null' },
    ]);
    expect(FilterConfigSchema.parse([{ column: 'd', operator: 'is_not_null' }])).toEqual([
      { column: 'd', operator: 'is_not_null' },
    ]);
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

  it('rejects a non-finite scalar number value (Infinity → invalid SQL when inlined)', () => {
    expect(() =>
      FilterConfigSchema.parse([{ column: 'amount', operator: 'gt', value: Infinity }])
    ).toThrow();
    expect(() =>
      FilterConfigSchema.parse([{ column: 'amount', operator: 'eq', value: -Infinity }])
    ).toThrow();
  });

  it('rejects a non-finite bound in a between filter', () => {
    expect(() =>
      FilterConfigSchema.parse([
        { column: 'amount', operator: 'between', value: { from: 1, to: Infinity } },
      ])
    ).toThrow();
  });
});

describe('FilterRuleSchema placement', () => {
  it('keeps placement undefined when omitted (downstream treats absence as post-join)', () => {
    const parsed = FilterRuleSchema.parse({ column: 'x', operator: 'eq', value: 1 });
    expect(parsed.placement).toBeUndefined();
  });

  it('accepts explicit placement="post-join"', () => {
    const parsed = FilterRuleSchema.parse({
      column: 'x',
      operator: 'eq',
      value: 1,
      placement: 'post-join',
    });
    expect(parsed.placement).toBe('post-join');
  });

  it('accepts placement="pre-join" with a unified column name and scalar rule', () => {
    const parsed = FilterRuleSchema.parse({
      column: 'users__userRole',
      operator: 'eq',
      value: 'admin',
      placement: 'pre-join',
    });
    expect(parsed.placement).toBe('pre-join');
    expect(parsed.column).toBe('users__userRole');
  });

  it('accepts placement="pre-join" with a unified column name and relative_date rule', () => {
    expect(
      FilterRuleSchema.parse({
        column: 'users_profiles__createdAt',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
        placement: 'pre-join',
      })
    ).toMatchObject({ placement: 'pre-join', column: 'users_profiles__createdAt' });
  });

  it('accepts placement="pre-join" without additional metadata (validator resolves via index)', () => {
    expect(
      FilterRuleSchema.parse({
        column: 'users__x',
        operator: 'eq',
        value: 1,
        placement: 'pre-join',
      })
    ).toMatchObject({ placement: 'pre-join', column: 'users__x' });
  });
});

describe('aliasPathToCteName', () => {
  it('maps a single-segment path to itself', () => {
    expect(aliasPathToCteName('users')).toBe('users');
  });
  it('replaces dots with underscores', () => {
    expect(aliasPathToCteName('users.profiles.country')).toBe('users_profiles_country');
  });
  it('throws on invalid path', () => {
    expect(() => aliasPathToCteName('Users')).toThrow();
  });
});
