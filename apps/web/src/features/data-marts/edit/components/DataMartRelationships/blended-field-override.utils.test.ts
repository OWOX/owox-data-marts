import { describe, it, expect } from 'vitest';
import { cleanBlendedFieldOverride } from './blended-field-override.utils';

describe('cleanBlendedFieldOverride', () => {
  it('drops an unset postJoinAggregations (→ type-derived default applies)', () => {
    expect(cleanBlendedFieldOverride({})).toEqual({});
  });

  it('persists an explicit empty array (analyst cleared all = none allowed)', () => {
    expect(cleanBlendedFieldOverride({ postJoinAggregations: [] })).toEqual({
      postJoinAggregations: [],
    });
  });

  it('persists a chosen subset verbatim', () => {
    expect(cleanBlendedFieldOverride({ postJoinAggregations: ['MIN', 'MAX'] })).toEqual({
      postJoinAggregations: ['MIN', 'MAX'],
    });
  });

  it('keeps the existing alias / isHidden / aggregateFunction omit rules', () => {
    expect(
      cleanBlendedFieldOverride({
        alias: 'Revenue',
        isHidden: true,
        aggregateFunction: 'SUM',
        postJoinAggregations: ['AVG'],
      })
    ).toEqual({
      alias: 'Revenue',
      isHidden: true,
      aggregateFunction: 'SUM',
      postJoinAggregations: ['AVG'],
    });
  });

  it('drops an empty-string alias but keeps a false isHidden', () => {
    expect(cleanBlendedFieldOverride({ alias: '', isHidden: false })).toEqual({ isHidden: false });
  });
});
