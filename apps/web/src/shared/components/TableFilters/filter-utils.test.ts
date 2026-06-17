import { describe, expect, it } from 'vitest';
import { getDefaultFilterOperator } from './filter-utils';

describe('getDefaultFilterOperator', () => {
  it('defaults to is when both contains and is are available', () => {
    expect(getDefaultFilterOperator(['contains', 'not_contains', 'eq', 'neq'])).toBe('eq');
  });

  it('keeps the first configured operator when the field does not offer both contains and is', () => {
    expect(getDefaultFilterOperator(['contains', 'not_contains'])).toBe('contains');
    expect(getDefaultFilterOperator(['neq', 'eq'])).toBe('neq');
  });

  it('returns undefined when no operators are configured', () => {
    expect(getDefaultFilterOperator([])).toBeUndefined();
  });
});
