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
});
