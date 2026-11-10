import { describe, expect, it } from 'vitest';
import { pickReleaseToAnnounce, shouldAnnounce } from './announcement';
import { compareVersions } from './release-version';
import type { AnnouncedRelease } from './types';

const release = (version: string, overrides: Partial<AnnouncedRelease> = {}): AnnouncedRelease => ({
  version,
  releasedAt: '2026-11-02T14:23:04.000Z',
  videoUrl: `https://customer-x.cloudflarestream.com/${version}/iframe`,
  chapters: [],
  changes: ['A change'],
  ...overrides,
});

const DAY = 24 * 60 * 60 * 1000;
const RELEASED = Date.parse('2026-11-09T14:43:46.000Z');

describe('compareVersions', () => {
  it.each([
    ['0.41.0', '0.40.0', 1],
    ['0.40.0', '0.41.0', -1],
    ['0.41.0', '0.41.0', 0],
    ['0.10.0', '0.9.0', 1],
    ['0.42.0-next-20261105101010', '0.41.0', 1],
    ['0.42.0-next-20261105101010', '0.42.0', -1],
    ['0.42.0-next-20261105101010', '0.42.0-next-20261104101010', 1],
  ])('compares %s with %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('orders prereleases by semver precedence', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1], ordered[i])).toBe(-1);
      expect(compareVersions(ordered[i], ordered[i - 1])).toBe(1);
    }
  });

  it('returns null when a value is not a version', () => {
    expect(compareVersions('latest', '0.41.0')).toBeNull();
    expect(compareVersions('0.41.0', '')).toBeNull();
  });
});

describe('pickReleaseToAnnounce', () => {
  const releases = [release('0.41.0'), release('0.40.0'), release('0.39.0')];

  it('picks the latest release on a cloud snapshot one minor ahead', () => {
    expect(pickReleaseToAnnounce(releases, '0.42.0-next-20261105101010')?.version).toBe('0.41.0');
  });

  it('does not announce a release newer than a self-hosted install', () => {
    expect(pickReleaseToAnnounce(releases, '0.40.0')?.version).toBe('0.40.0');
    expect(pickReleaseToAnnounce(releases, '0.39.2')?.version).toBe('0.39.0');
  });

  it('waits for the release on a snapshot that leads to it', () => {
    expect(pickReleaseToAnnounce(releases, '0.41.0-next-20261101101010')?.version).toBe('0.40.0');
  });

  it('picks the newest release when the running version is unknown', () => {
    expect(pickReleaseToAnnounce([release('0.40.0'), release('0.41.0')], null)?.version).toBe(
      '0.41.0'
    );
  });

  it('waits for the video during the first days after a release', () => {
    const withoutVideo = release('0.42.0', {
      videoUrl: null,
      releasedAt: new Date(RELEASED).toISOString(),
    });
    const picked = (now: number) =>
      pickReleaseToAnnounce([withoutVideo, ...releases], '0.43.0-next-1', now)?.version;

    expect(picked(RELEASED + 2 * DAY)).toBe('0.41.0');
    expect(picked(RELEASED + 3 * DAY)).toBe('0.42.0');
  });

  it('never announces a release without a video that has no date or no changes', () => {
    const late = RELEASED + 30 * DAY;
    expect(
      pickReleaseToAnnounce([release('0.42.0', { videoUrl: null, releasedAt: null })], null, late)
    ).toBeNull();
    expect(
      pickReleaseToAnnounce([release('0.42.0', { videoUrl: null, changes: [] })], null, late)
    ).toBeNull();
  });

  it('returns null when no release qualifies', () => {
    expect(pickReleaseToAnnounce(releases, '0.38.0')).toBeNull();
    expect(pickReleaseToAnnounce([], null)).toBeNull();
  });
});

describe('shouldAnnounce', () => {
  const decide = (lastSeenVersion: string | null, hasUsedProduct: boolean) =>
    shouldAnnounce({ releaseVersion: '0.41.0', lastSeenVersion, hasUsedProduct });

  it('announces a release newer than the last one shown', () => {
    expect(decide('0.40.0', false)).toBe(true);
  });

  it('does not announce a release already shown, or an older one', () => {
    expect(decide('0.41.0', true)).toBe(false);
    expect(decide('0.42.0', true)).toBe(false);
  });

  it('announces to a returning user seen for the first time in this browser', () => {
    expect(decide(null, true)).toBe(true);
  });

  it('waits until a new user has a Data Mart', () => {
    expect(decide(null, false)).toBe(false);
  });

  it('treats an unreadable stored value as no value', () => {
    expect(decide('oops', false)).toBe(false);
    expect(decide('oops', true)).toBe(true);
  });
});
