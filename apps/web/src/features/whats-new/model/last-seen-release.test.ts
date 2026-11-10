// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { lastSeenRelease } from './last-seen-release';

const KEY = 'whats-new-last-seen-release:user-1';

describe('lastSeenRelease', () => {
  beforeEach(() => {
    localStorage.clear();
    lastSeenRelease.dismissShown();
    localStorage.clear();
  });

  it('records a release only when its card is closed', () => {
    lastSeenRelease.markShown('user-1', '0.43.0');
    expect(lastSeenRelease.get('user-1')).toBeNull();

    expect(lastSeenRelease.dismissShown()).toBe('0.43.0');
    expect(localStorage.getItem(KEY)).toBe('0.43.0');
  });

  it('keeps a newer release that another tab already recorded', () => {
    lastSeenRelease.markShown('user-1', '0.43.0');
    localStorage.setItem(KEY, '0.44.0');

    expect(lastSeenRelease.dismissShown()).toBe('0.43.0');
    expect(localStorage.getItem(KEY)).toBe('0.44.0');
  });

  it('replaces an unreadable record', () => {
    localStorage.setItem(KEY, 'oops');
    lastSeenRelease.markShown('user-1', '0.43.0');

    lastSeenRelease.dismissShown();
    expect(localStorage.getItem(KEY)).toBe('0.43.0');
  });

  it('does nothing when no card was shown', () => {
    expect(lastSeenRelease.dismissShown()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
