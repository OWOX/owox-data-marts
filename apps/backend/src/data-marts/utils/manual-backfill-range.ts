import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

/** Matches the RunDataMartRequestApiDto payload contract; kept as a literal so this module
 * does not depend on Core.RUN_CONFIG_TYPE being present (some specs stub @owox/connectors
 * with a minimal Core for unrelated reasons). */
export const MANUAL_BACKFILL_RUN_TYPE = 'MANUAL_BACKFILL';

const DEFAULT_MAX_MANUAL_BACKFILL_DAYS = 31;

/** Inclusive number of days one MANUAL_BACKFILL run may cover. Owned by the connectors package;
 * falls back to the documented default when a minimal/stubbed Core doesn't carry it. */
export const MAX_MANUAL_BACKFILL_DAYS: number =
  typeof Core.MAX_MANUAL_BACKFILL_DAYS === 'number'
    ? Core.MAX_MANUAL_BACKFILL_DAYS
    : DEFAULT_MAX_MANUAL_BACKFILL_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface BackfillDateRange {
  startDate: string;
  endDate: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toUtcDay(value: unknown): number | undefined {
  if (typeof value !== 'string' || !ISO_DAY_PATTERN.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return undefined;
  // Reject dates like 2026-02-30 that Date.parse silently rolls over.
  return formatUtcDay(ms) === value ? ms : undefined;
}

function formatUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function countBackfillDays(range: BackfillDateRange): number {
  const start = toUtcDay(range.startDate);
  const end = toUtcDay(range.endDate);
  if (start === undefined || end === undefined || end < start) return 0;
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
  const todayMs = startOfUtcDay(today);
  const start = toUtcDay(data.StartDate);
  if (start === undefined) {
    throw new BusinessViolationException('StartDate is required in YYYY-MM-DD format');
  }
  if (start > todayMs) {
    throw new BusinessViolationException('StartDate cannot be in the future');
  }

  let end = todayMs;
  if (data.EndDate !== undefined && data.EndDate !== null && data.EndDate !== '') {
    const parsed = toUtcDay(data.EndDate);
    if (parsed === undefined) {
      throw new BusinessViolationException('EndDate must be in YYYY-MM-DD format');
    }
    end = Math.min(parsed, todayMs);
  }
  if (end < start) {
    throw new BusinessViolationException('EndDate cannot be earlier than StartDate');
  }

  const range = { startDate: formatUtcDay(start), endDate: formatUtcDay(end) };
  const days = countBackfillDays(range);
  if (days > MAX_MANUAL_BACKFILL_DAYS) {
    throw new BusinessViolationException(
      `Manual backfill is limited to ${MAX_MANUAL_BACKFILL_DAYS} days per run (requested ${days} days)`
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
