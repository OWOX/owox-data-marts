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
});

describe('FilterRuleSchema placement / aliasPath', () => {
  it('keeps placement undefined when omitted (downstream treats absence as post-join)', () => {
    const parsed = FilterRuleSchema.parse({ column: 'x', operator: 'eq', value: 1 });
    expect(parsed.placement).toBeUndefined();
    expect(parsed.aliasPath).toBeUndefined();
  });

  it('accepts explicit placement="post-join" without aliasPath', () => {
    const parsed = FilterRuleSchema.parse({
      column: 'x',
      operator: 'eq',
      value: 1,
      placement: 'post-join',
    });
    expect(parsed.placement).toBe('post-join');
  });

  it('rejects placement="post-join" with aliasPath set', () => {
    expect(() =>
      FilterRuleSchema.parse({
        column: 'x',
        operator: 'eq',
        value: 1,
        placement: 'post-join',
        aliasPath: 'users',
      })
    ).toThrow();
  });

  it('accepts placement="pre-join" with single-segment aliasPath and scalar rule', () => {
    const parsed = FilterRuleSchema.parse({
      column: 'userRole',
      operator: 'eq',
      value: 'admin',
      placement: 'pre-join',
      aliasPath: 'users',
    });
    expect(parsed.placement).toBe('pre-join');
    expect(parsed.aliasPath).toBe('users');
  });

  it('accepts placement="pre-join" with dotted aliasPath and relative_date rule', () => {
    expect(
      FilterRuleSchema.parse({
        column: 'createdAt',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
        placement: 'pre-join',
        aliasPath: 'users.profiles',
      })
    ).toMatchObject({ placement: 'pre-join', aliasPath: 'users.profiles' });
  });

  it('rejects placement="pre-join" without aliasPath', () => {
    expect(() =>
      FilterRuleSchema.parse({
        column: 'x',
        operator: 'eq',
        value: 1,
        placement: 'pre-join',
      })
    ).toThrow();
  });

  it('rejects placement="pre-join" with aliasPath="main" (home mart not slicable)', () => {
    expect(() =>
      FilterRuleSchema.parse({
        column: 'x',
        operator: 'eq',
        value: 1,
        placement: 'pre-join',
        aliasPath: 'main',
      })
    ).toThrow();
  });

  it('rejects aliasPath with uppercase / dashes / leading dot / trailing dot', () => {
    const base = { column: 'x', operator: 'eq', value: 1, placement: 'pre-join' as const };
    expect(() => FilterRuleSchema.parse({ ...base, aliasPath: 'Users' })).toThrow();
    expect(() => FilterRuleSchema.parse({ ...base, aliasPath: 'users-table' })).toThrow();
    expect(() => FilterRuleSchema.parse({ ...base, aliasPath: '.users' })).toThrow();
    expect(() => FilterRuleSchema.parse({ ...base, aliasPath: 'users.' })).toThrow();
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
