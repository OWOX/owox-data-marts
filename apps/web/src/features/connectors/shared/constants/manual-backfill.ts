/**
 * Earliest StartDate a manual backfill accepts. A typo guard, not a business cap: a year such as
 * `0202` would plan tens of thousands of segments.
 * Mirrors MIN_MANUAL_BACKFILL_START_DATE in apps/backend/src/data-marts/utils/manual-backfill-range.ts;
 * keep the two in sync.
 */
export const MIN_MANUAL_BACKFILL_START_DATE = '2000-01-01';

/** Periods longer than this get a heads-up that the backfill can run for hours. */
export const LARGE_BACKFILL_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toUtcDayMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !ISO_DAY_PATTERN.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * How many calendar months a StartDate/EndDate pair touches — the backend loads a backfill in
 * one part per month (mirrors `calendarMonthWindows` in
 * apps/backend/src/data-marts/utils/manual-backfill-range.ts). 0 when either date is invalid
 * or the range is reversed.
 */
export function countBackfillSegments(startDate: unknown, endDate: unknown): number {
  const start = toUtcDayMs(startDate);
  const end = toUtcDayMs(endDate);
  if (start === undefined || end === undefined || end < start) return 0;
  const first = new Date(start);
  const last = new Date(end);
  return (
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    (last.getUTCMonth() - first.getUTCMonth()) +
    1
  );
}

/** Inclusive day count for a StartDate/EndDate pair, or 0 when either is invalid or reversed. */
export function countBackfillDays(startDate: unknown, endDate: unknown): number {
  const start = toUtcDayMs(startDate);
  const end = toUtcDayMs(endDate);
  if (start === undefined || end === undefined || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}
