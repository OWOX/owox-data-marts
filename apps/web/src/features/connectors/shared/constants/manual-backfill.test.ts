import { describe, expect, it } from 'vitest';
import {
  MAX_MANUAL_BACKFILL_DAYS,
  MIN_MANUAL_BACKFILL_START_DATE,
  countBackfillDays,
  countBackfillSegments,
} from './manual-backfill';

describe('manual-backfill', () => {
  it('fits a full calendar month within the limit', () => {
    expect(countBackfillDays('2026-07-01', '2026-07-31')).toBe(MAX_MANUAL_BACKFILL_DAYS);
    expect(countBackfillDays('2026-07-01', '2026-08-01')).toBeGreaterThan(MAX_MANUAL_BACKFILL_DAYS);
  });

  it('splits a period into segments of at most 31 days', () => {
    expect(countBackfillSegments(1)).toBe(1);
    expect(countBackfillSegments(31)).toBe(1);
    expect(countBackfillSegments(32)).toBe(2);
    expect(countBackfillSegments(62)).toBe(2);
    expect(countBackfillSegments(63)).toBe(3);
    expect(countBackfillSegments(547)).toBe(18);
  });

  it('keeps the earliest allowed start date in step with the backend', () => {
    // apps/backend/src/data-marts/utils/manual-backfill-range.ts rejects earlier start dates.
    expect(MIN_MANUAL_BACKFILL_START_DATE).toBe('2000-01-01');
    expect(countBackfillDays(MIN_MANUAL_BACKFILL_START_DATE, '2000-01-31')).toBe(31);
  });

  it('counts inclusive days and treats invalid or reversed ranges as empty', () => {
    expect(countBackfillDays('2026-07-01', '2026-07-01')).toBe(1);
    expect(countBackfillDays('2026-07-10', '2026-07-01')).toBe(0);
    expect(countBackfillDays('', '2026-07-01')).toBe(0);
    expect(countBackfillDays(undefined, undefined)).toBe(0);
  });
});
