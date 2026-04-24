import { deepEqual } from './deep-equal.util';

describe('deepEqual', () => {
  it.each([
    ['identical primitives', 1, 1, true],
    ['different primitives', 1, 2, false],
    ['strings', 'foo', 'foo', true],
    ['null vs undefined', null, undefined, false],
    ['null vs null', null, null, true],
    ['empty objects', {}, {}, true],
    ['empty arrays', [], [], true],
    ['NaN vs NaN', NaN, NaN, true],
  ])('%s: %p vs %p -> %p', (_label, a, b, expected) => {
    expect(deepEqual(a, b)).toBe(expected);
  });

  it('compares arrays element-wise', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });

  it('compares objects key-order-insensitive', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('compares nested objects and arrays', () => {
    expect(
      deepEqual(
        { sources: [{ path: 'orders', alias: 'o' }] },
        { sources: [{ alias: 'o', path: 'orders' }] }
      )
    ).toBe(true);
    expect(
      deepEqual(
        { sources: [{ path: 'orders', alias: 'o' }] },
        { sources: [{ path: 'orders', alias: 'other' }] }
      )
    ).toBe(false);
  });

  it('distinguishes array vs object with matching keys', () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });

  it('returns false for different Date instances (non-plain objects are unsupported)', () => {
    expect(deepEqual(new Date('2026-01-01'), new Date('2026-01-02'))).toBe(false);
    expect(deepEqual(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(false);
  });

  it('returns true only for the same Date reference', () => {
    const d = new Date('2026-01-01');
    expect(deepEqual(d, d)).toBe(true);
  });

  it('returns false for Map and Set instances', () => {
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(false);
    expect(deepEqual(new Set([1, 2]), new Set([1, 2]))).toBe(false);
  });

  it('returns false for class instances even with matching enumerable fields', () => {
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }
    expect(deepEqual(new Point(1, 2), new Point(1, 2))).toBe(false);
    expect(deepEqual(new Point(1, 2), { x: 1, y: 2 })).toBe(false);
  });

  it('returns false when a plain object nests a non-plain value', () => {
    expect(deepEqual({ at: new Date('2026-01-01') }, { at: new Date('2026-01-01') })).toBe(false);
  });

  it('ignores inherited (non-own) keys and only compares own enumerable keys', () => {
    const base = { polluted: true };
    const a = Object.assign(Object.create(base), { x: 1 });
    const b = { x: 1 };
    expect(deepEqual(a, b)).toBe(false);
    expect(deepEqual({ x: 1 }, { x: 1 })).toBe(true);
  });
});
