import { describe, it, expect } from 'vitest';
import { getAtPath, setAtPath, toDotPath } from './manifestPath';

describe('manifestPath', () => {
  it('getAtPath reads nested values', () => {
    const obj = { a: { b: { c: 1 } } };
    expect(getAtPath(obj, ['a', 'b', 'c'])).toBe(1);
    expect(getAtPath(obj, ['a', 'x'])).toBeUndefined();
    expect(getAtPath(obj, [])).toBe(obj);
  });

  it('setAtPath returns a new object and does not mutate the input', () => {
    const obj = { a: { b: 1 } };
    const next = setAtPath(obj, ['a', 'b'], 2);
    expect(next).not.toBe(obj);
    expect(next.a).not.toBe(obj.a);
    expect((next as { a: { b: number } }).a.b).toBe(2);
    expect(obj.a.b).toBe(1);
  });

  it('setAtPath creates intermediate objects', () => {
    const next = setAtPath({}, ['a', 'b', 'c'], 5) as { a: { b: { c: number } } };
    expect(next.a.b.c).toBe(5);
  });

  it('setAtPath rejects prototype-pollution keys', () => {
    expect(() => setAtPath({}, ['__proto__', 'x'], 1)).toThrow();
    expect(() => setAtPath({}, ['a', 'constructor'], 1)).toThrow();
    expect(() => setAtPath({}, ['prototype'], 1)).toThrow();
  });

  it('setAtPath with an empty path returns the value', () => {
    expect(setAtPath({ a: 1 }, [], 'replaced')).toBe('replaced');
  });

  it('setAtPath overwrites a primitive intermediate cleanly (no index keys)', () => {
    const next = setAtPath({ a: 'xy' }, ['a', 'b'], 1) as unknown as { a: Record<string, unknown> };
    expect(next.a).toEqual({ b: 1 });
  });
});

describe('toDotPath', () => {
  it('splits a dot path into trimmed segments', () => {
    expect(toDotPath('data.items')).toEqual(['data', 'items']);
    expect(toDotPath(' data . items ')).toEqual(['data', 'items']);
  });

  it('drops empty segments so a half-typed path stays usable', () => {
    expect(toDotPath('data.')).toEqual(['data']);
    expect(toDotPath('a..b')).toEqual(['a', 'b']);
    expect(toDotPath('')).toEqual([]);
    expect(toDotPath('   ')).toEqual([]);
  });
});
