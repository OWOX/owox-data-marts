import { JSON_TEXT } from './json-text.transformer';

const from = (value: unknown) => (JSON_TEXT.from as (v: unknown) => unknown)(value);
const to = (value: unknown) => (JSON_TEXT.to as (v: unknown) => unknown)(value);

describe('JSON_TEXT', () => {
  it('reads stored text back as the JSON value', () => {
    expect(from('12345')).toBe(12345);
    expect(from('"12345"')).toBe('12345');
  });

  // SQLite's numeric affinity, or a driver that parsed the value already.
  it('reads a number the driver handed back', () => {
    expect(from(12345)).toBe(12345);
  });

  it.each([null, undefined])('reads %s as null', value => {
    expect(from(value)).toBeNull();
  });

  it('stores the string "12345" as text that reads back as the string', () => {
    const stored = to('12345');

    expect(stored).toBe('"12345"');
    expect(from(stored)).toBe('12345');
  });

  it('round-trips an object', () => {
    const value = { a: [1, { b: null }], c: 'x' };

    expect(from(to(value))).toStrictEqual(value);
  });

  it.each([null, undefined])('stores %s untouched', value => {
    expect(to(value)).toBe(value);
  });
});
