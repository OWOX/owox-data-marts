import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  describeCoverage,
  formatDataLastUpdatedLabel,
  formatRelativeTime,
} from './data-last-updated.utils';

const NOW = new Date('2026-07-28T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it.each([
    ['2026-07-28T11:59:30.000Z', '30 seconds ago'],
    ['2026-07-28T11:55:00.000Z', '5 minutes ago'],
    ['2026-07-28T09:00:00.000Z', '3 hours ago'],
    ['2026-07-25T12:00:00.000Z', '3 days ago'],
    ['2026-05-28T12:00:00.000Z', '2 months ago'],
    ['2024-07-28T12:00:00.000Z', '2 years ago'],
  ])('formats %s as "%s"', (iso, expected) => {
    expect(formatRelativeTime(iso, NOW)).toBe(expected);
  });

  it('clamps future timestamps (clock skew) to now instead of "in N minutes"', () => {
    expect(formatRelativeTime('2026-07-28T12:05:00.000Z', NOW)).toBe('now');
  });

  it('returns empty for garbage input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});

describe('formatDataLastUpdatedLabel', () => {
  // formatDataLastUpdatedLabel reads the real clock, so the fixture's distance from
  // "now" grows every day — 30 days after the fixture date, the day step gives way
  // to the month step and numeric:'auto' renders "last month", which has no "ago"
  // suffix. Pin the clock so the fixture is always 3 days old.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  const block = {
    dataLastUpdatedAt: '2026-07-25T08:30:00.000Z',
    computedAt: '2026-07-28T00:00:00.000Z',
    coverage: 'complete' as const,
    sources: [],
  };

  it('is "Unknown" when the check never ran', () => {
    expect(formatDataLastUpdatedLabel(null)).toBe('Unknown');
    expect(formatDataLastUpdatedLabel(undefined)).toBe('Unknown');
  });

  it('is "Unknown" — not stale — when the warehouse could not tell', () => {
    expect(
      formatDataLastUpdatedLabel({ ...block, dataLastUpdatedAt: null, coverage: 'unavailable' })
    ).toBe('Unknown');
  });

  it('marks partial coverage as a floor', () => {
    expect(formatDataLastUpdatedLabel({ ...block, coverage: 'partial' })).toMatch(/^≥ /);
  });

  it('renders a bare relative time for complete coverage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(formatDataLastUpdatedLabel(block)).toBe('3 days ago');
  });
});

describe('describeCoverage', () => {
  it('explains every coverage flag', () => {
    expect(describeCoverage('complete')).toContain('All source tables');
    expect(describeCoverage('partial')).toContain('more recent');
    expect(describeCoverage('unavailable')).toContain('did not report');
  });
});
