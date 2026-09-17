import { describe, expect, it } from 'vitest';
import {
  MAX_MANUAL_BACKFILL_DAYS,
  countBackfillDays,
  countBackfillRuns,
  todayIsoDay,
} from './manual-backfill';

describe('manual-backfill', () => {
  it('counts inclusive days and treats invalid or reversed ranges as empty', () => {
    expect(countBackfillDays('2026-07-01', '2026-07-31')).toBe(31);
    expect(countBackfillDays('2026-07-01', '2026-07-01')).toBe(1);
    expect(countBackfillDays('2026-07-10', '2026-07-01')).toBe(0);
    expect(countBackfillDays('', '2026-07-01')).toBe(0);
    expect(countBackfillDays(undefined, undefined)).toBe(0);
  });

  it('fits a full calendar month in one run and splits anything longer', () => {
    expect(countBackfillRuns(MAX_MANUAL_BACKFILL_DAYS)).toBe(1);
    expect(countBackfillRuns(MAX_MANUAL_BACKFILL_DAYS + 1)).toBe(2);
    expect(countBackfillRuns(75)).toBe(3);
  });

  it('formats today as a UTC ISO day', () => {
    expect(todayIsoDay(new Date('2026-09-17T23:59:00.000Z'))).toBe('2026-09-17');
  });
});
