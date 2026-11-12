import { describe, expect, it } from '@jest/globals';
import { formatProjectTitle, MAX_EMAIL_PROJECT_TITLE_LENGTH } from './format-project-title.js';

describe('formatProjectTitle', () => {
  it('keeps an ordinary title', () => {
    expect(formatProjectTitle('drewpiq project 2945')).toBe('drewpiq project 2945');
    expect(formatProjectTitle('📊 Sales — Q4')).toBe('📊 Sales — Q4');
  });

  it('turns full stops into spaces, so a domain is not a link', () => {
    expect(formatProjectTitle('shop.example.com')).toBe('shop example com');
  });

  it.each([
    ['fullwidth', 'evil\uFF0Ecom/login', 'evil com/login'],
    ['ideographic', 'evil\u3002com', 'evil com'],
    ['halfwidth ideographic', 'evil\uFF61com', 'evil com'],
    ['one dot leader', 'evil\u2024com', 'evil com'],
    ['small', 'evil\uFE52com', 'evil com'],
  ])('treats the %s full stop as a full stop', (_name, title, expected) => {
    expect(formatProjectTitle(title)).toBe(expected);
  });

  it('breaks URLs without dots', () => {
    expect(formatProjectTitle('Reset at http://3232235777/x')).toBe(
      'Reset at http: //3232235777/x'
    );
    expect(formatProjectTitle('https://[2001:db8::1]/login')).toBe('https: //[2001:db8::1]/login');
    expect(formatProjectTitle('\uFF48\uFF54\uFF54\uFF50\uFF1A\uFF0F\uFF0F3232235777')).toBe(
      'http: //3232235777'
    );
  });

  it('removes invisible characters that hide or reverse text', () => {
    expect(formatProjectTitle('\u202Emoc\u3002live\u202C')).toBe('moc live');
    expect(formatProjectTitle('a\u200B.\u200Bcom')).toBe('a com');
    expect(formatProjectTitle('\u2066Acme\u2069\uFEFF')).toBe('Acme');
  });

  it('turns line breaks and other control characters into single spaces', () => {
    expect(formatProjectTitle(' Line\nbreak\r\n\tand  \u0007spaces ')).toBe(
      'Line break and spaces'
    );
  });

  it('cuts long titles', () => {
    const formatted = formatProjectTitle(`${'Urgent '.repeat(30)}verify your account`);

    expect(Array.from(formatted)).toHaveLength(MAX_EMAIL_PROJECT_TITLE_LENGTH);
    expect(formatted.endsWith('…')).toBe(true);
    expect(formatted).not.toContain('verify your account');
  });

  it('does not split a character made of two code units when cutting', () => {
    const formatted = formatProjectTitle('📊'.repeat(MAX_EMAIL_PROJECT_TITLE_LENGTH + 5));

    expect(Array.from(formatted)).toEqual([
      ...Array.from('📊'.repeat(MAX_EMAIL_PROJECT_TITLE_LENGTH - 1)),
      '…',
    ]);
  });

  it('returns an empty string when nothing readable is left', () => {
    expect(formatProjectTitle('...')).toBe('');
    expect(formatProjectTitle('\u200B\u202E')).toBe('');
  });
});
