/**
 * Inclusive number of days in one segment of a manual backfill. A longer period runs as
 * consecutive segments of at most this many days.
 * Mirrors MAX_MANUAL_BACKFILL_DAYS in packages/connectors/src/Constants/CommonConstants.js,
 * which the backend segments by; keep the two in sync.
 */
export const MAX_MANUAL_BACKFILL_DAYS = 31;

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

/** How many segments of at most MAX_MANUAL_BACKFILL_DAYS cover `days` days. */
export function countBackfillSegments(days: number): number {
  return Math.ceil(days / MAX_MANUAL_BACKFILL_DAYS);
}

/** Inclusive day count for a StartDate/EndDate pair, or 0 when either is invalid or reversed. */
export function countBackfillDays(startDate: unknown, endDate: unknown): number {
  const start = toUtcDayMs(startDate);
  const end = toUtcDayMs(endDate);
  if (start === undefined || end === undefined || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}
