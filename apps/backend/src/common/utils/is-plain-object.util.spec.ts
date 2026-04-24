import { isPlainObject } from './is-plain-object.util';

describe('isPlainObject', () => {
  it('rejects null and undefined', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('rejects primitives', () => {
    expect(isPlainObject(0)).toBe(false);
    expect(isPlainObject('s')).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(Symbol('x'))).toBe(false);
  });

  it('accepts plain object literals', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it('accepts objects created with null prototype', () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('accepts objects created with Object.prototype', () => {
    expect(isPlainObject(Object.create(Object.prototype))).toBe(true);
  });

  it('rejects objects with non-standard prototype chain', () => {
    expect(isPlainObject(Object.create(Object.create(null)))).toBe(false);
  });

  it('rejects arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it('rejects built-ins (Date, Map, Set)', () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
  });

  it('rejects class instances', () => {
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }
    expect(isPlainObject(new Point(1, 2))).toBe(false);
  });

  it('accepts JSON payloads with a literal "__proto__" key', () => {
    const payload = JSON.parse('{"a":1,"__proto__":{"polluted":true}}');
    expect(isPlainObject(payload)).toBe(true);
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
  });

  it('narrows the type to a record', () => {
    const value: unknown = { a: 1 };
    if (isPlainObject(value)) {
      const x: Record<string, unknown> = value;
      expect(x.a).toBe(1);
    }
  });
});
