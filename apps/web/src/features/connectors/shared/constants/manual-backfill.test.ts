import { describe, expect, it } from 'vitest';
import {
  MIN_MANUAL_BACKFILL_START_DATE,
  countBackfillDays,
  countBackfillSegments,
} from './manual-backfill';

describe('manual-backfill', () => {
  it('counts one run for up to 31 days, else one part per calendar month', () => {
    expect(countBackfillSegments('2026-07-01', '2026-07-01')).toBe(1);
    expect(countBackfillSegments('2026-07-01', '2026-07-31')).toBe(1);
    // 1 January – 15 April: January, February, March, 1–15 April.
    expect(countBackfillSegments('2026-01-01', '2026-04-15')).toBe(4);
    // A period that fits one run stays one run, even across a month boundary.
    expect(countBackfillSegments('2026-07-15', '2026-08-10')).toBe(1);
    expect(countBackfillSegments('2026-10-31', '2026-11-01')).toBe(1);
    // 32 days: one day over, so January and 1 February.
    expect(countBackfillSegments('2026-01-01', '2026-02-01')).toBe(2);
    expect(countBackfillSegments('2024-01-01', '2025-06-30')).toBe(18);
    expect(countBackfillSegments('2024-12-15', '2025-01-20')).toBe(2);
  });

  it('counts no parts for an invalid or reversed range', () => {
    expect(countBackfillSegments('2026-07-10', '2026-07-01')).toBe(0);
    expect(countBackfillSegments('', '2026-07-01')).toBe(0);
    expect(countBackfillSegments(undefined, undefined)).toBe(0);
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
