import {
  MAIN_UNIQUE_COUNT_SOURCE,
  hasMainUniqueCount,
  joinedUniqueCountSources,
  normalizeUniqueCountSources,
} from './unique-count-sources';

describe('unique-count-sources', () => {
  it('maps the legacy boolean onto the main source', () => {
    expect(normalizeUniqueCountSources(true)).toEqual([MAIN_UNIQUE_COUNT_SOURCE]);
    expect(normalizeUniqueCountSources(false)).toEqual([]);
    expect(normalizeUniqueCountSources(null)).toEqual([]);
    expect(normalizeUniqueCountSources(undefined)).toEqual([]);
  });

  it('passes an explicit list through, de-duplicated and order-preserving', () => {
    expect(normalizeUniqueCountSources(['orders', 'orders', 'orders.items'])).toEqual([
      'orders',
      'orders.items',
    ]);
  });

  it('splits main from joined sources', () => {
    const config = ['', 'orders'];
    expect(hasMainUniqueCount(config)).toBe(true);
    expect(joinedUniqueCountSources(config)).toEqual(['orders']);
  });

  it('treats the legacy boolean as main-only', () => {
    expect(hasMainUniqueCount(true)).toBe(true);
    expect(joinedUniqueCountSources(true)).toEqual([]);
  });
});
