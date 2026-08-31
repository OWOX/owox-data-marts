import { compareSemver, formatSemver, parseReleaseTag, sameCompatibilityLine } from './semver.util';

describe('parseReleaseTag', () => {
  it.each([
    ['1.2.3', { major: 1, minor: 2, patch: 3 }],
    ['v1.2.3', { major: 1, minor: 2, patch: 3 }],
    ['v0.0.1', { major: 0, minor: 0, patch: 1 }],
    ['10.20.30', { major: 10, minor: 20, patch: 30 }],
    ['  v1.2.3  ', { major: 1, minor: 2, patch: 3 }],
  ])('accepts %s', (tag, parts) => {
    expect(parseReleaseTag(tag)).toEqual({ ok: true, parts });
  });

  // D6: these ARE valid strict SemVer 2.0.0 and are refused deliberately, so the
  // reason must name the rule they broke. Reporting them as 'not-semver' would send
  // a publisher hunting for a typo in a textbook-correct tag.
  it.each(['1.2.3-beta', 'v1.2.3-rc.1', '1.2.3-0', '1.2.3-rc.1+build'])(
    'refuses prerelease tag %s',
    tag => {
      expect(parseReleaseTag(tag)).toEqual({ ok: false, reason: 'prerelease' });
    }
  );

  it.each(['1.2.3+build', 'v1.2.3+20260728.1'])('refuses build metadata %s', tag => {
    expect(parseReleaseTag(tag)).toEqual({ ok: false, reason: 'build-metadata' });
  });

  it.each(['1.2', '1.2.3.4', '01.2.3', '1.02.3', 'release-1.2.3', 'V1.2.3', 'vv1.2.3', '', 'abc'])(
    'refuses %s as not semver',
    tag => {
      expect(parseReleaseTag(tag)).toEqual({ ok: false, reason: 'not-semver' });
    }
  );
});

describe('formatSemver', () => {
  it('drops any v prefix from the canonical form', () => {
    expect(formatSemver({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
  });
});

describe('compareSemver', () => {
  it('orders numerically, not lexically', () => {
    // '1.10.0' < '1.9.0' under string comparison -- this is why the util exists.
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('compares major, then minor, then patch', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('1.3.0', '1.2.9')).toBeGreaterThan(0);
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
  });

  it('sorts a release list into activation order', () => {
    const sorted = ['1.9.0', '2.0.0', '1.10.0', '1.2.3'].sort(compareSemver);
    expect(sorted).toEqual(['1.2.3', '1.9.0', '1.10.0', '2.0.0']);
  });
});

describe('sameCompatibilityLine', () => {
  it('groups by major from 1.0.0 on', () => {
    expect(sameCompatibilityLine('1.2.3', '1.9.0')).toBe(true);
    expect(sameCompatibilityLine('1.2.3', '2.0.0')).toBe(false);
  });

  // SemVer promises no stability below 1.0.0, so the line narrows to the minor: a 0.x
  // plugin declares a breaking change with a minor bump, without leaving 0.x.
  it('narrows to the minor below 1.0.0', () => {
    expect(sameCompatibilityLine('0.1.0', '0.1.5')).toBe(true);
    expect(sameCompatibilityLine('0.1.0', '0.2.0')).toBe(false);
    expect(sameCompatibilityLine('0.1.0', '1.1.0')).toBe(false);
  });
});
