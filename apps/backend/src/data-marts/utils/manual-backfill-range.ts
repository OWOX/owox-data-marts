import { z } from 'zod';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

/** Matches the RunDataMartRequestApiDto payload contract; kept as a literal so this module
 * does not depend on Core.RUN_CONFIG_TYPE being present (some specs stub @owox/connectors
 * with a minimal Core for unrelated reasons). */
export const MANUAL_BACKFILL_RUN_TYPE = 'MANUAL_BACKFILL';

/**
 * Inclusive number of days one MANUAL_BACKFILL run may cover. The connectors package is the
 * only source of this value; it is read when a backfill is validated rather than at import,
 * so specs that stub `Core` for unrelated reasons still load, while a stale connectors build
 * fails loudly on the first real backfill instead of silently using a different limit.
 */
export function getMaxManualBackfillDays(): number {
  const limit: unknown = Core.MAX_MANUAL_BACKFILL_DAYS;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw new Error(
      'MAX_MANUAL_BACKFILL_DAYS is missing from @owox/connectors; rebuild the package'
    );
  }
  return limit;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUtcDay(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

/** A calendar day that exists: the regex catches the shape, the refine catches 2026-02-30. */
const isoDaySchema = z
  .string()
  .regex(ISO_DAY_PATTERN)
  .refine(value => {
    const ms = toUtcDay(value);
    return !Number.isNaN(ms) && formatUtcDay(ms) === value;
  });

const manualBackfillDatesSchema = z.object({
  StartDate: isoDaySchema,
  EndDate: isoDaySchema.or(z.literal('')).nullish(),
});

export interface BackfillDateRange {
  startDate: string;
  endDate: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function countBackfillDays(range: BackfillDateRange): number {
  const start = toUtcDay(range.startDate);
  const end = toUtcDay(range.endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}

/**
 * Validates the user-supplied StartDate/EndDate the same way AbstractConnector does
 * (EndDate defaults to today and is clamped to today) and enforces the per-run day limit,
 * before a run is created so the caller gets a 4xx instead of a failed run.
 */
export function parseManualBackfillRange(
  data: Record<string, unknown>,
  today: Date
): BackfillDateRange {
  const parsed = manualBackfillDatesSchema.safeParse(data);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    throw new BusinessViolationException(
      field === 'EndDate'
        ? 'EndDate must be in YYYY-MM-DD format'
        : 'StartDate is required in YYYY-MM-DD format'
    );
  }

  const todayMs = startOfUtcDay(today);
  const start = toUtcDay(parsed.data.StartDate);
  if (start > todayMs) {
    throw new BusinessViolationException('StartDate cannot be in the future');
  }

  const end = parsed.data.EndDate ? Math.min(toUtcDay(parsed.data.EndDate), todayMs) : todayMs;
  if (end < start) {
    throw new BusinessViolationException('EndDate cannot be earlier than StartDate');
  }

  const range = { startDate: formatUtcDay(start), endDate: formatUtcDay(end) };
  const days = countBackfillDays(range);
  const maxDays = getMaxManualBackfillDays();
  if (days > maxDays) {
    throw new BusinessViolationException(
      `Manual backfill is limited to ${maxDays} days per run (requested ${days} days)`
    );
  }
  return range;
}

/**
 * Validates a MANUAL_BACKFILL payload before a run is created and normalizes its dates
 * (EndDate filled in and clamped). Non-backfill payloads pass through untouched.
 */
export function prepareManualBackfillPayload(
  payload: Record<string, unknown> | undefined,
  today: Date
): Record<string, unknown> | undefined {
  if (!payload || payload.runType !== MANUAL_BACKFILL_RUN_TYPE) return payload;

  const data = isRecord(payload.data) ? payload.data : {};
  const { startDate, endDate } = parseManualBackfillRange(data, today);
  return { ...payload, data: { ...data, StartDate: startDate, EndDate: endDate } };
}
