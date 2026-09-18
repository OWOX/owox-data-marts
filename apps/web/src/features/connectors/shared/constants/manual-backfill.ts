/**
 * Inclusive number of days one manual backfill run may cover.
 * Mirrors MAX_MANUAL_BACKFILL_DAYS in packages/connectors/src/Constants/CommonConstants.js,
 * which the backend enforces; keep the two in sync.
 */
export const MAX_MANUAL_BACKFILL_DAYS = 31;

/** Connector-core field names that carry the backfill period. */
export const BACKFILL_START_DATE_FIELD = 'StartDate';
export const BACKFILL_END_DATE_FIELD = 'EndDate';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toUtcDayMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !ISO_DAY_PATTERN.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

export function todayIsoDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Inclusive day count for a StartDate/EndDate pair, or 0 when either is invalid or reversed. */
export function countBackfillDays(startDate: unknown, endDate: unknown): number {
  const start = toUtcDayMs(startDate);
  const end = toUtcDayMs(endDate);
  if (start === undefined || end === undefined || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}
