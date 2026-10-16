import { z } from 'zod';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

import { Core } from '@owox/connectors';

// Literal, not Core.RUN_CONFIG_TYPE: some specs stub @owox/connectors with a minimal Core.
export const MANUAL_BACKFILL_RUN_TYPE = 'MANUAL_BACKFILL';

/** Inclusive days one backfill segment may cover. Read lazily so Core stubs load; throws on a stale build. */
export function getMaxManualBackfillDays(): number {
  const limit = Number(Core.MAX_MANUAL_BACKFILL_DAYS);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      'MAX_MANUAL_BACKFILL_DAYS is missing from @owox/connectors; rebuild the package'
    );
  }
  return limit;
}

/**
 * Earliest StartDate a manual backfill accepts. A typo guard, not a business cap: a year such as
 * `0202` would otherwise plan tens of thousands of segments. The web form mirrors this value.
 */
export const MIN_MANUAL_BACKFILL_START_DATE = '2000-01-01';

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
 * (EndDate defaults to today and is clamped to today), before a run is created so the caller
 * gets a 4xx instead of a failed run. The period has no length limit, only a start-date floor
 * (`MIN_MANUAL_BACKFILL_START_DATE`): the executor runs a long one as consecutive segments of
 * at most `getMaxManualBackfillDays()` days.
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
  if (start < toUtcDay(MIN_MANUAL_BACKFILL_START_DATE)) {
    throw new BusinessViolationException(
      `StartDate cannot be earlier than ${MIN_MANUAL_BACKFILL_START_DATE}`
    );
  }

  const end = parsed.data.EndDate ? Math.min(toUtcDay(parsed.data.EndDate), todayMs) : todayMs;
  if (end < start) {
    throw new BusinessViolationException('EndDate cannot be earlier than StartDate');
  }

  return { startDate: formatUtcDay(start), endDate: formatUtcDay(end) };
}

/** The first `maxDays` inclusive days of `range`; the range itself when it is not longer. */
export function clampBackfillWindow(range: BackfillDateRange, maxDays: number): BackfillDateRange {
  const lastDay = toUtcDay(range.startDate) + (maxDays - 1) * DAY_MS;
  return {
    startDate: range.startDate,
    endDate: formatUtcDay(Math.min(toUtcDay(range.endDate), lastDay)),
  };
}

/** How many segments of at most `maxDays` days cover `range`. */
export function countBackfillSegments(range: BackfillDateRange, maxDays: number): number {
  return Math.ceil(countBackfillDays(range) / maxDays);
}

/** The window of the 1-based `segmentIndex`-th segment of `requested`. */
export function backfillSegmentWindow(
  requested: BackfillDateRange,
  segmentIndex: number,
  maxDays: number
): BackfillDateRange {
  const start = toUtcDay(requested.startDate) + (segmentIndex - 1) * maxDays * DAY_MS;
  const end = Math.min(start + (maxDays - 1) * DAY_MS, toUtcDay(requested.endDate));
  return { startDate: formatUtcDay(start), endDate: formatUtcDay(end) };
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
 * The period of a normalized manual backfill body, or undefined for any other body: a
 * non-backfill run, a connector without date fields, or an EndDate that was never filled in.
 */
export function readBackfillRange(body: Record<string, unknown>): BackfillDateRange | undefined {
  if (!isManualBackfillPayload(body) || !isRecord(body.data)) return undefined;
  const dates = manualBackfillDatesSchema.safeParse(body.data);
  if (!dates.success || !dates.data.EndDate) return undefined;
  return { startDate: dates.data.StartDate, endDate: dates.data.EndDate };
}

/** The body with its EndDate replaced, leaving the caller's body untouched. */
export function withBackfillEndDate(
  body: Record<string, unknown>,
  endDate: string
): Record<string, unknown> {
  return { ...body, data: { ...(body.data as Record<string, unknown>), EndDate: endDate } };
}

/** The body with its StartDate and EndDate set to `window`, leaving the caller's body untouched. */
export function withBackfillWindow(
  body: Record<string, unknown>,
  window: BackfillDateRange
): Record<string, unknown> {
  return {
    ...body,
    data: {
      ...(body.data as Record<string, unknown>),
      StartDate: window.startDate,
      EndDate: window.endDate,
    },
  };
}

/** Key under `DataMartRun.additionalParams` identifying one segment run of a backfill chain. */
export const BACKFILL_CHAIN_KEY = 'backfill';

const backfillChainMetaSchema = z.object({
  /** Groups every segment run of one user-requested backfill. */
  id: z.string().min(1),
  requestedStart: isoDaySchema,
  requestedEnd: isoDaySchema,
  /** 1-based position of this run's segment within the requested period. */
  segmentIndex: z.number().int().min(1),
  segmentsTotal: z.number().int().min(1),
  /**
   * Days per segment the chain was planned with, so a later change of the segment size cannot
   * misalign the windows of a chain already running. Absent on rows created before it existed.
   */
  segmentDays: z.number().int().min(1).optional(),
});

export type BackfillChainMeta = z.infer<typeof backfillChainMetaSchema>;

/** The chain metadata of a segment run, or undefined for a run that is not part of a chain. */
export function readBackfillChainMeta(additionalParams: unknown): BackfillChainMeta | undefined {
  if (!isRecord(additionalParams)) return undefined;
  const parsed = backfillChainMetaSchema.safeParse(additionalParams[BACKFILL_CHAIN_KEY]);
  return parsed.success ? parsed.data : undefined;
}

export interface BackfillChainPlan {
  /** The first segment's body: the normalized payload with EndDate cut to one segment. */
  readonly payload: Record<string, unknown>;
  readonly meta: BackfillChainMeta;
}

/**
 * Plans a backfill that needs more than one segment, or returns undefined for anything else:
 * a non-backfill run, a connector without date fields, or a period that fits one segment —
 * those execute in a single run exactly as before.
 */
export function planBackfillChain(
  payload: Record<string, unknown> | undefined,
  chainId: string
): BackfillChainPlan | undefined {
  if (!payload) return undefined;
  const requested = readBackfillRange(payload);
  if (!requested) return undefined;

  const maxDays = getMaxManualBackfillDays();
  const segmentsTotal = countBackfillSegments(requested, maxDays);
  if (segmentsTotal <= 1) return undefined;

  return {
    payload: withBackfillEndDate(payload, clampBackfillWindow(requested, maxDays).endDate),
    meta: {
      id: chainId,
      requestedStart: requested.startDate,
      requestedEnd: requested.endDate,
      segmentIndex: 1,
      segmentsTotal,
      segmentDays: maxDays,
    },
  };
}

/**
 * The `additionalParams` of the next segment run: the previous segment's body re-windowed,
 * plus the advanced chain metadata. Shared by the executor (queues the next segment with the
 * terminal write) and the repair sweep (queues it when that transaction never happened).
 */
export function nextSegmentAdditionalParams(
  currentAdditionalParams: unknown,
  meta: BackfillChainMeta,
  window: BackfillDateRange
): Record<string, unknown> {
  return {
    payload: withBackfillWindow(unwrapRunPayload(currentAdditionalParams), window),
    [BACKFILL_CHAIN_KEY]: meta,
  };
}

export type BackfillChainStep =
  | {
      readonly action: 'continue';
      readonly meta: BackfillChainMeta;
      readonly window: BackfillDateRange;
    }
  | { readonly action: 'end'; readonly chainEnd: 'finished' };

/**
 * What the chain does after one segment run ended on its own (not cancelled, restricted,
 * interrupted, or shut down — those stop or suspend the chain outside this rule).
 *
 * A completed segment that advanced no checkpoint ends the chain as finished: the connector
 * ignored the window (a catalog or full-refresh node loads the whole source regardless of
 * dates), or every remaining day lies beyond the node's end lag — either way later segments
 * would load nothing more. A failed segment never ends the chain (failure isolation): every
 * segment of the requested period runs, however many fail.
 *
 * The windows use the segment size the chain was planned with; `defaultMaxDays` applies only
 * to a chain created before that size was stored.
 */
export function nextBackfillChainStep(
  meta: BackfillChainMeta,
  outcome: { segmentSucceeded: boolean; anyProgressAdvanced: boolean },
  defaultMaxDays: number
): BackfillChainStep {
  const maxDays = meta.segmentDays ?? defaultMaxDays;
  if (meta.segmentIndex >= meta.segmentsTotal) return { action: 'end', chainEnd: 'finished' };
  if (outcome.segmentSucceeded && !outcome.anyProgressAdvanced) {
    return { action: 'end', chainEnd: 'finished' };
  }

  const nextIndex = meta.segmentIndex + 1;
  const requested = { startDate: meta.requestedStart, endDate: meta.requestedEnd };
  return {
    action: 'continue',
    meta: { ...meta, segmentIndex: nextIndex },
    window: backfillSegmentWindow(requested, nextIndex, maxDays),
  };
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
 * belongs to a different period, and honouring it would widen the run to days the caller never
 * asked for.
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
