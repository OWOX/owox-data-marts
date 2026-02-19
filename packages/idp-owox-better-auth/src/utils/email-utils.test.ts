import { describe, expect, it } from '@jest/globals';

import {
  formatError,
  generateNameFromEmail,
  isValidEmail,
  normalizeEmail,
  parseEmail,
  resolveNameWithFallback,
  splitName,
} from './email-utils.js';

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

  describe('resolveNameWithFallback', () => {
    it('returns existing name when present', () => {
      expect(resolveNameWithFallback('Jane Doe', 'user@example.com')).toBe('Jane Doe');
    });

    it('generates name from email when name is missing', () => {
      expect(resolveNameWithFallback(undefined, 'john.doe@example.com')).toBe('John Doe');
      expect(resolveNameWithFallback('', 'alice+tag@example.com')).toBe('Alice');
    });

    it('returns null when neither name nor usable email exists', () => {
      expect(resolveNameWithFallback(undefined, undefined)).toBeNull();
      expect(resolveNameWithFallback('', '   ')).toBeNull();
    });
  });

  describe('generateNameFromEmail', () => {
    it('handles basic separators and title-cases words', () => {
      expect(generateNameFromEmail('john.doe@example.com')).toBe('John Doe');
      expect(generateNameFromEmail('jane_smith@test.com')).toBe('Jane Smith');
      expect(generateNameFromEmail('bob-miller@test.com')).toBe('Bob Miller');
      expect(generateNameFromEmail('JOHN.DOE@test.com')).toBe('John Doe');
    });

    it('strips plus addressing tags', () => {
      expect(generateNameFromEmail('alice+tag@example.com')).toBe('Alice');
      expect(generateNameFromEmail('user.name+test@domain.com')).toBe('User Name');
      expect(generateNameFromEmail('user+tag+another@test.com')).toBe('User');
    });

    it('normalizes multiple separators', () => {
      expect(generateNameFromEmail('a_b-c.d@test.com')).toBe('A B C D');
      expect(generateNameFromEmail('user..name@test.com')).toBe('User Name');
      expect(generateNameFromEmail('user__name@test.com')).toBe('User Name');
      expect(generateNameFromEmail('user--name@test.com')).toBe('User Name');
    });

    it('falls back to full email for empty or invalid local parts', () => {
      expect(generateNameFromEmail('@example.com')).toBe('@example.com');
      expect(generateNameFromEmail('+tag@example.com')).toBe('+tag@example.com');
      expect(generateNameFromEmail('...@example.com')).toBe('...@example.com');
      expect(generateNameFromEmail('___@example.com')).toBe('___@example.com');
    });

    it('handles missing @ by treating the whole string as local-part', () => {
      expect(generateNameFromEmail('notanemail')).toBe('Notanemail');
      expect(generateNameFromEmail('user.name')).toBe('User Name');
    });

    it('returns empty string for non-string inputs', () => {
      expect(generateNameFromEmail('')).toBe('');
      expect(generateNameFromEmail(null as unknown as string)).toBe('');
      expect(generateNameFromEmail(undefined as unknown as string)).toBe('');
    });
  });
});
