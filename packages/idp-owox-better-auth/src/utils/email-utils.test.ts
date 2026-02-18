import { describe, expect, it } from '@jest/globals';

import { formatError, isValidEmail, normalizeEmail, parseEmail, splitName } from './email-utils.js';

describe('email-utils', () => {
  it('normalizes email by trimming and lowering case', () => {
    expect(normalizeEmail('  User@Example.Com ')).toBe('user@example.com');
  });

  it('validates emails with length and simple pattern', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a'.repeat(255) + '@example.com')).toBe(false);
  });

  it('parses and normalizes valid emails, returns null otherwise', () => {
    expect(parseEmail('User@Example.Com')).toBe('user@example.com');
    expect(parseEmail('invalid-email')).toBeNull();
    expect(parseEmail(123)).toBeNull();
  });

  it('splits names into first and last with cleanup', () => {
    expect(splitName()).toEqual({ firstName: '', lastName: '', fullName: '' });
    expect(splitName('Alice')).toEqual({ firstName: 'Alice', lastName: '', fullName: 'Alice' });
    expect(splitName(' Bob   Marley ')).toEqual({
      firstName: 'Bob',
      lastName: 'Marley',
      fullName: 'Bob   Marley',
    });
  });

  it('formats errors and non-error values', () => {
    const errorResult = formatError(new Error('boom'));
    expect(errorResult).toContain('boom');

    expect(formatError({ a: 1 })).toBe('[object Object]');
  });
});
