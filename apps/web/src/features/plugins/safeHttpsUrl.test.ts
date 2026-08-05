import { describe, expect, it } from 'vitest';
import { safeHttpsUrl } from './safeHttpsUrl';

describe('safeHttpsUrl', () => {
  it('accepts an absolute https url and returns its normalised form', () => {
    expect(safeHttpsUrl('https://github.com/acme/plugin')).toBe('https://github.com/acme/plugin');
  });

  it.each<[string | null | undefined]>([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['http://github.com/acme'],
    ['//evil.example/path'],
    ['/relative/path'],
    ['not a url'],
    [''],
    [null],
    [undefined],
  ])('refuses %s', candidate => {
    expect(safeHttpsUrl(candidate)).toBeNull();
  });
});
