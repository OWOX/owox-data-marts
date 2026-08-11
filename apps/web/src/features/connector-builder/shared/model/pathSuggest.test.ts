import { describe, it, expect } from 'vitest';
import { flattenPaths } from './pathSuggest';

describe('flattenPaths', () => {
  it('flattens nested objects into dot-paths', () => {
    const paths = flattenPaths({ id: 1, releaseDates: { Japan: 'x', Europe: 'y' } });
    expect(paths).toContain('id');
    expect(paths).toContain('releaseDates');
    expect(paths).toContain('releaseDates.Japan');
    expect(paths).toContain('releaseDates.Europe');
  });

  it('emits the array key only, not indices or element fields', () => {
    const paths = flattenPaths({ genre: ['a', 'b'], items: [{ x: 1 }] });
    expect(paths).toContain('genre');
    expect(paths).toContain('items');
    expect(paths).not.toContain('genre.0');
    expect(paths).not.toContain('items.0.x');
  });

  it('returns [] for non-object input', () => {
    expect(flattenPaths(null)).toEqual([]);
    expect(flattenPaths(42)).toEqual([]);
    expect(flattenPaths([1, 2])).toEqual([]);
  });

  it('caps recursion depth', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    const paths = flattenPaths(deep, { maxDepth: 2 });
    expect(paths).toContain('a');
    expect(paths).toContain('a.b');
    expect(paths).not.toContain('a.b.c');
  });

  it('caps total output at maxCount', () => {
    const obj = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    const paths = flattenPaths(obj, { maxCount: 10 });
    expect(paths).toHaveLength(10);
  });
});
