import { describe, expect, it } from 'vitest';
import {
  appendRoute,
  canonicalPluginRoute,
  isValidPluginRoute,
  normalizePluginRoute,
  routeFromLocation,
} from './pluginRoute';

describe('isValidPluginRoute', () => {
  it.each(['/', '/d/123', '/d/123?x=1#y', '/a%2Fb', '/d/звіт'])('accepts %s', route => {
    expect(isValidPluginRoute(route)).toBe(true);
  });

  it.each([
    ['no leading slash', 'd/1'],
    ['a protocol-relative start', '//external.example'],
    ['a parent segment', '/../../settings'],
    ['a dot segment', '/a/./b'],
    ['an encoded parent segment', '/%2e%2e/x'],
    ['a mixed-case encoded parent segment', '/.%2E/x'],
    ['a trailing parent segment', '/a/..'],
    ['a trailing-space parent segment', '/.. '],
    ['an encoded trailing-space parent segment', '/%2e%2e '],
    ['a trailing-space segment after a path', '/a/.. '],
    ['a backslash', '/foo\\bar'],
    ['an encoded backslash', '/foo%5cbar'],
    ['a control character', '/a\u0000b'],
    ['a newline', '/a\nb'],
    ['a right-to-left override', '/a\u202eb'],
    ['a bidi isolate', '/a\u2066b'],
    ['a zero-width space', '/a\u200bb'],
    ['a right-to-left mark', '/a\u200fb'],
    ['a byte-order mark', '/a\ufeffb'],
    ['an over-long route', `/${'a'.repeat(2048)}`],
    ['a non-string', 7],
  ])('rejects %s', (_label, route) => {
    expect(isValidPluginRoute(route)).toBe(false);
  });

  it('accepts a non-ASCII route whose encoded form stays within the limit', () => {
    expect(isValidPluginRoute(`/d/${'з'.repeat(340)}`)).toBe(true);
  });

  it('rejects a non-ASCII route whose encoded form exceeds the limit', () => {
    expect(isValidPluginRoute(`/d/${'з'.repeat(400)}`)).toBe(false);
  });
});

describe('normalizePluginRoute', () => {
  it.each([
    ['a space', '/a b', '/a%20b'],
    ['non-ASCII', '/d/звіт', '/d/%D0%B7%D0%B2%D1%96%D1%82'],
    ['link-breaking characters', '/a"<>`', '/a%22%3C%3E%60'],
    ['a C1 control', '/a\u0085b', '/a%C2%85b'],
    ['a query and a hash', '/d/1?q=a b#h c', '/d/1?q=a%20b#h%20c'],
    ['an already encoded route', '/a%20b?x=1#y', '/a%20b?x=1#y'],
  ])('encodes %s', (_label, route, canonical) => {
    expect(normalizePluginRoute(route)).toBe(canonical);
  });

  it.each([
    ['a parent segment', '/../x'],
    ['a protocol-relative start', '//external.example'],
    ['a right-to-left override', '/a\u202eb'],
    ['a non-string', 7],
  ])('refuses %s', (_label, route) => {
    expect(normalizePluginRoute(route)).toBeNull();
  });

  it('measures the limit on the encoded form', () => {
    const atLimit = `/${'з'.repeat(341)}a`;

    expect(normalizePluginRoute(atLimit)).toHaveLength(2048);
    expect(normalizePluginRoute(`${atLimit}b`)).toBeNull();
  });
});

describe('canonicalPluginRoute', () => {
  it('drops a campaign tag the plugin itself reports, keeping the other parameters', () => {
    expect(canonicalPluginRoute('/d?utm_source=x&a=1')).toBe('/d?a=1');
  });

  it('drops the query entirely when it holds only a campaign tag', () => {
    expect(canonicalPluginRoute('/d?utm_medium=y')).toBe('/d');
  });

  it('refuses what normalizePluginRoute refuses', () => {
    expect(canonicalPluginRoute('/../x')).toBeNull();
  });
});

describe('routeFromLocation', () => {
  const base = '/ui/p/plugins/x/open';

  it('reads the inner route with its query and hash', () => {
    expect(routeFromLocation({ pathname: `${base}/d/1`, search: '?t=2', hash: '#h' }, base)).toBe(
      '/d/1?t=2#h'
    );
  });

  it('treats the bare open path as the root', () => {
    expect(routeFromLocation({ pathname: base, search: '', hash: '' }, base)).toBe('/');
  });

  it('falls back to the root for an invalid route', () => {
    expect(
      routeFromLocation({ pathname: `${base}//evil.example`, search: '', hash: '' }, base)
    ).toBe('/');
  });

  it('falls back to the root outside the open path', () => {
    expect(routeFromLocation({ pathname: '/ui/p/plugins/x', search: '', hash: '' }, base)).toBe(
      '/'
    );
  });

  it('drops campaign tags and keeps the other parameters as they are', () => {
    const location = {
      pathname: `${base}/d/1`,
      search: '?a=1&utm_source=owox.com&b=%E2%9C%93&UTM_Medium=site&utmost=2',
      hash: '#h',
    };

    expect(routeFromLocation(location, base)).toBe('/d/1?a=1&b=%E2%9C%93&utmost=2#h');
  });

  it('drops the query entirely when it holds only campaign tags', () => {
    const location = { pathname: base, search: '?utm_source=owox.com&utm_campaign=x', hash: '' };

    expect(routeFromLocation(location, base)).toBe('/');
  });

  it('round-trips an accepted non-ASCII route read back from its encoded address', () => {
    const route = '/d/звіт';
    const address = new URL(`https://route.invalid${base}${route}`);
    const location = { pathname: address.pathname, search: address.search, hash: address.hash };

    expect(routeFromLocation(location, base)).toBe('/d/%D0%B7%D0%B2%D1%96%D1%82');
  });
});

describe('appendRoute', () => {
  it('keeps the bare base for the root and appends anything else', () => {
    expect(appendRoute('/b/open', '/')).toBe('/b/open');
    expect(appendRoute('/b/open', '/d/1?x=1')).toBe('/b/open/d/1?x=1');
  });
});
