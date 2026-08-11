import { z } from 'zod';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

import { Core } from '@owox/connectors';

// Literal, not Core.RUN_CONFIG_TYPE: some specs stub @owox/connectors with a minimal Core.
export const MANUAL_BACKFILL_RUN_TYPE = 'MANUAL_BACKFILL';

/** Inclusive days one backfill run may cover. Read lazily so Core stubs load; throws on a stale build. */
export function getMaxManualBackfillDays(): number {
  const limit = Number(Core.MAX_MANUAL_BACKFILL_DAYS);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      'MAX_MANUAL_BACKFILL_DAYS is missing from @owox/connectors; rebuild the package'
    );
  }
  return limit;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUtcDay(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

/**
 * A calendar day that exists. The date part of an ISO-8601 timestamp is accepted too, because
 * `JSON.stringify` serializes a `Date` that way and that shape worked before this validation.
 */
const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)
  .transform(value => value.slice(0, 10))
  .pipe(z.string().date());

const manualBackfillDatesSchema = z.object({
  StartDate: isoDaySchema,
  EndDate: isoDaySchema.or(z.literal('')).nullish(),
});

export interface BackfillDateRange {
  startDate: string;
  endDate: string;
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
export function parseManualBackfillRange(data: unknown, today: Date): BackfillDateRange {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates a MANUAL_BACKFILL payload before a run is created and normalizes its dates
 * (EndDate filled in and clamped). Non-backfill payloads, and backfills for connectors that
 * declare no date fields, pass through untouched.
 */
export function prepareManualBackfillPayload(
  payload: Record<string, unknown> | undefined,
  today: Date
): Record<string, unknown> | undefined {
  if (!payload || payload.runType !== MANUAL_BACKFILL_RUN_TYPE) return payload;

  // A connector without backfill date fields (Google Sheets, for example) treats a manual
  // backfill as a full refresh and posts no StartDate. Leave that payload untouched; the
  // connector still raises "StartDate is required" for the connectors that do need one.
  if (!isRecord(payload.data) || payload.data.StartDate === undefined) return payload;

  const { startDate, endDate } = parseManualBackfillRange(payload.data, today);
  return { ...payload, data: { ...payload.data, StartDate: startDate, EndDate: endDate } };
}

/** Key under `DataMartRun.additionalParams` holding the per-configuration backfill cursor. */
export const BACKFILL_PROGRESS_KEY = 'backfillProgress';

/**
 * The run body as the connector layer consumes it, `{ runType, data }`.
 *
 * A run receives that shape directly on its first attempt, but the interrupted-run sweep
 * replays `DataMartRun.additionalParams`, which nests the same body under `payload` next to
 * the run's own state. Both shapes unwrap here so callers never have to know which attempt
 * they are on.
 */
export function unwrapRunPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  return isRecord(payload.payload) ? payload.payload : payload;
}

export function isManualBackfillPayload(body: Record<string, unknown>): boolean {
  return body.runType === MANUAL_BACKFILL_RUN_TYPE;
}

/**
 * Normalizes a connector-reported date to a UTC calendar day, or undefined when it is
 * unusable. Connectors pass a `Date`, which serializes as a full ISO timestamp, so the day
 * part is taken rather than required.
 */
export function parseBackfillDay(value: unknown): string | undefined {
  const parsed = isoDaySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Per-configuration backfill progress recorded by previous attempts of the same run.
 *
 * Entries are validated one by one: a single corrupt value must not discard the progress of
 * every other configuration, since that would silently re-import days already stored.
 */
export function readBackfillProgress(additionalParams: unknown): Record<string, string> {
  if (!isRecord(additionalParams)) return {};

  const stored = additionalParams[BACKFILL_PROGRESS_KEY];
  if (!isRecord(stored)) return {};

  return Object.entries(stored).reduce<Record<string, string>>((progress, [configId, value]) => {
    const day = parseBackfillDay(value);
    return day ? { ...progress, [configId]: day } : progress;
  }, {});
}

export interface BackfillResume {
  /** The body to run, with StartDate moved forward when a previous attempt got further. */
  readonly body: Record<string, unknown>;
  /** The day the resumed run starts from; absent when nothing was resumed. */
  readonly resumedFrom?: string;
  /** The last day a previous attempt fully loaded; absent when nothing was resumed. */
  readonly lastLoadedDate?: string;
}

/**
 * Continues a manual backfill from the day after the last one a previous attempt fully
 * loaded, instead of re-importing the whole selected period.
 *
 * The body is returned untouched when there is nothing to resume: a non-backfill run, a
 * connector that declares no date fields, a payload whose EndDate was never normalized, or a
 * checkpoint that is unusable. A checkpoint earlier than StartDate is also ignored — it
 * belongs to a different period, and honouring it would widen the run past the day limit the
 * caller already validated.
 */
export function resumeManualBackfillPayload(
  body: Record<string, unknown>,
  lastLoadedDate: string | undefined
): BackfillResume {
  if (!isManualBackfillPayload(body) || !lastLoadedDate || !isRecord(body.data)) return { body };

  const lastLoadedDay = parseBackfillDay(lastLoadedDate);
  const dates = manualBackfillDatesSchema.safeParse(body.data);
  if (!lastLoadedDay || !dates.success || !dates.data.EndDate) return { body };

  const lastLoaded = toUtcDay(lastLoadedDay);
  const start = toUtcDay(dates.data.StartDate);
  const end = toUtcDay(dates.data.EndDate);
  if (lastLoaded < start) return { body };

  // Clamped rather than skipped when the whole period was already loaded: re-importing one
  // stored day is idempotent, because every storage merges on its unique keys. Skipping the
  // run instead would need a second code path that reports success without the connector
  // ever confirming its own field and catalog work.
  const resumeFrom = formatUtcDay(Math.min(lastLoaded + DAY_MS, end));
  if (resumeFrom === dates.data.StartDate) return { body };

  return {
    body: { ...body, data: { ...body.data, StartDate: resumeFrom } },
    resumedFrom: resumeFrom,
    lastLoadedDate: lastLoadedDay,
  };
}
