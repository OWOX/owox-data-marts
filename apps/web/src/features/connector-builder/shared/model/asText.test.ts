import { describe, it, expect } from 'vitest';
import { asText, firstNonEmpty } from './asText';

describe('firstNonEmpty', () => {
  it('falls through an empty string, which `??` would keep', () => {
    expect(firstNonEmpty('', 'fallback')).toBe('fallback');
  });

  it('falls through undefined and null as well as an empty string', () => {
    expect(firstNonEmpty(undefined, null, '', 'x')).toBe('x');
  });

  it('falls through an absent optional display string (manifest.title -> manifest.name)', () => {
    const manifest: { title?: string; name: string } = { name: 'MyApi' };
    expect(firstNonEmpty(manifest.title, manifest.name)).toBe('MyApi');
  });

  it('returns the first present value and ignores the rest', () => {
    expect(firstNonEmpty('My API', 'MyApi', 'this connector')).toBe('My API');
  });

  it('keeps a falsy-but-present string, which `||` would skip', () => {
    expect(firstNonEmpty('0', 'fallback')).toBe('0');
  });

  it('treats a whitespace-only string as present (only "" is empty)', () => {
    expect(firstNonEmpty(' ', 'fallback')).toBe(' ');
  });

  it('returns an empty string when called with no arguments', () => {
    expect(firstNonEmpty()).toBe('');
  });

  it('returns an empty string when every value is absent or empty', () => {
    expect(firstNonEmpty(undefined, null, '')).toBe('');
  });
});

describe('asText', () => {
  it('JSON-serialises an object instead of rendering "[object Object]"', () => {
    expect(asText({ a: 1 })).toBe('{"a":1}');
  });

  it('JSON-serialises an array instead of joining it', () => {
    expect(asText([1, 2])).toBe('[1,2]');
  });

  it('renders 0 as "0", not as the fallback', () => {
    expect(asText(0, 'fb')).toBe('0');
  });

  it('renders false as "false", not as the fallback', () => {
    expect(asText(false, 'fb')).toBe('false');
  });

  it('renders a bigint', () => {
    expect(asText(9007199254740993n, 'fb')).toBe('9007199254740993');
  });

  it('passes a string through untouched, including an empty one', () => {
    expect(asText('already text')).toBe('already text');
    expect(asText('', 'fb')).toBe('');
  });

  it('returns the fallback for undefined and null', () => {
    expect(asText(undefined, 'fb')).toBe('fb');
    expect(asText(null, 'fb')).toBe('fb');
  });

  it('defaults the fallback to an empty string', () => {
    expect(asText(undefined)).toBe('');
  });

  it('returns the fallback for a function, which has no useful text form', () => {
    expect(asText(() => 1, 'fb')).toBe('fb');
  });

  it('returns the fallback for a symbol, which JSON.stringify drops', () => {
    expect(asText(Symbol('token'), 'fb')).toBe('fb');
  });

  it('returns the fallback for a circular object instead of throwing', () => {
    const circular: { name: string; self?: unknown } = { name: 'node' };
    circular.self = circular;
    expect(() => asText(circular, 'fb')).not.toThrow();
    expect(asText(circular, 'fb')).toBe('fb');
  });

  it('returns the fallback when serialisation throws for any other reason', () => {
    const hostile = {
      toJSON() {
        throw new Error('nope');
      },
    };
    expect(asText(hostile, 'fb')).toBe('fb');
  });
});
