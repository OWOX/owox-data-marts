import { describe, expect, it } from 'vitest';
import { decideAnnouncement, pickReleaseToAnnounce } from './announcement';
import { compareVersions } from './release-version';
import type { AnnouncedRelease } from './types';

const release = (version: string): AnnouncedRelease => ({
  version,
  videoUrl: `https://customer-x.cloudflarestream.com/${version}/iframe`,
  chapters: [],
});

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

  it('returns null when no release qualifies', () => {
    expect(pickReleaseToAnnounce(releases, '0.38.0')).toBeNull();
    expect(pickReleaseToAnnounce([], null)).toBeNull();
  });
});

describe('decideAnnouncement', () => {
  it('shows a release newer than the last one seen', () => {
    expect(
      decideAnnouncement({
        releaseVersion: '0.41.0',
        lastSeenVersion: '0.40.0',
        hasUsedProduct: false,
      })
    ).toBe('show');
  });

  it('does nothing for a release already seen', () => {
    expect(
      decideAnnouncement({
        releaseVersion: '0.41.0',
        lastSeenVersion: '0.41.0',
        hasUsedProduct: true,
      })
    ).toBe('none');
    expect(
      decideAnnouncement({
        releaseVersion: '0.40.0',
        lastSeenVersion: '0.41.0',
        hasUsedProduct: true,
      })
    ).toBe('none');
  });

  it('shows the release to a returning user seen for the first time in this browser', () => {
    expect(
      decideAnnouncement({ releaseVersion: '0.41.0', lastSeenVersion: null, hasUsedProduct: true })
    ).toBe('show');
  });

  it('only remembers the release for a new user', () => {
    expect(
      decideAnnouncement({ releaseVersion: '0.41.0', lastSeenVersion: null, hasUsedProduct: false })
    ).toBe('remember');
  });

  it('treats an unreadable stored value as no value', () => {
    expect(
      decideAnnouncement({
        releaseVersion: '0.41.0',
        lastSeenVersion: 'oops',
        hasUsedProduct: false,
      })
    ).toBe('remember');
  });
});
