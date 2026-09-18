import { describe, expect, it } from 'vitest';
import { MAX_MANUAL_BACKFILL_DAYS, countBackfillDays, todayIsoDay } from './manual-backfill';

describe('manual-backfill', () => {
  it('fits a full calendar month within the limit', () => {
    expect(countBackfillDays('2026-07-01', '2026-07-31')).toBe(MAX_MANUAL_BACKFILL_DAYS);
    expect(countBackfillDays('2026-07-01', '2026-08-01')).toBeGreaterThan(MAX_MANUAL_BACKFILL_DAYS);
  });

  it('counts inclusive days and treats invalid or reversed ranges as empty', () => {
    expect(countBackfillDays('2026-07-01', '2026-07-01')).toBe(1);
    expect(countBackfillDays('2026-07-10', '2026-07-01')).toBe(0);
    expect(countBackfillDays('', '2026-07-01')).toBe(0);
    expect(countBackfillDays(undefined, undefined)).toBe(0);
  });

  it('formats today as a UTC ISO day', () => {
    expect(todayIsoDay(new Date('2026-09-17T23:59:00.000Z'))).toBe('2026-09-17');
  });
});
