import { z } from 'zod';
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

const isoDaySchema = z.string().regex(ISO_DAY_PATTERN);

/** Whole-range descriptor carried on every chunk run of a split backfill. */
export const BackfillChainSchema = z.object({
  startDate: isoDaySchema,
  endDate: isoDaySchema,
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1),
});
export type BackfillChain = z.infer<typeof BackfillChainSchema>;

export interface BackfillDateRange {
  startDate: string;
  endDate: string;
}

/** Field names are the connector-core convention read by AbstractConnector. */
export interface BackfillChunk {
  StartDate: string;
  EndDate: string;
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
 * (EndDate defaults to today and is clamped to today), but before a run is created so
 * the caller gets a 4xx instead of a failed run.
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

  return { startDate: formatUtcDay(start), endDate: formatUtcDay(end) };
}

export function splitBackfillRange(
  range: BackfillDateRange,
  maxDays: number = MAX_MANUAL_BACKFILL_DAYS
): BackfillChunk[] {
  const start = toUtcDay(range.startDate);
  const end = toUtcDay(range.endDate);
  if (start === undefined || end === undefined || end < start) return [];

  const chunks: BackfillChunk[] = [];
  for (let chunkStart = start; chunkStart <= end; chunkStart += maxDays * DAY_MS) {
    const chunkEnd = Math.min(chunkStart + (maxDays - 1) * DAY_MS, end);
    chunks.push({ StartDate: formatUtcDay(chunkStart), EndDate: formatUtcDay(chunkEnd) });
  }
  return chunks;
}

export function readBackfillChain(payload: unknown): BackfillChain | undefined {
  if (!isRecord(payload) || payload.backfillChain === undefined) return undefined;
  const parsed = BackfillChainSchema.safeParse(payload.backfillChain);
  if (!parsed.success) {
    throw new BusinessViolationException('Invalid backfill chain descriptor');
  }
  if (parsed.data.chunkIndex >= parsed.data.totalChunks) {
    throw new BusinessViolationException('Backfill chunk index is out of range');
  }
  return parsed.data;
}

/**
 * Normalizes a MANUAL_BACKFILL payload before a run is created: validates the range,
 * narrows `data` to the first chunk and, when the range spans several chunks, attaches
 * the chain descriptor. Payloads that already carry a chain (internal next-chunk calls)
 * and non-backfill payloads pass through untouched.
 */
export function prepareManualBackfillPayload(
  payload: Record<string, unknown> | undefined,
  today: Date
): Record<string, unknown> | undefined {
  if (!payload || payload.runType !== MANUAL_BACKFILL_RUN_TYPE) return payload;
  if (readBackfillChain(payload)) return payload;

  const data = isRecord(payload.data) ? payload.data : {};
  const range = parseManualBackfillRange(data, today);
  const chunks = splitBackfillRange(range);
  const prepared = { ...payload, data: { ...data, ...chunks[0] } };
  if (chunks.length === 1) return prepared;

  return {
    ...prepared,
    backfillChain: { ...range, chunkIndex: 0, totalChunks: chunks.length },
  };
}

/** Payload for the chunk after the one described by `payload`, or undefined when it was the last. */
export function buildNextBackfillChunkPayload(
  payload: unknown
): (Record<string, unknown> & { data: BackfillChunk; backfillChain: BackfillChain }) | undefined {
  const chain = readBackfillChain(payload);
  if (!chain || !isRecord(payload)) return undefined;

  const nextIndex = chain.chunkIndex + 1;
  const chunks = splitBackfillRange(chain);
  if (nextIndex >= chunks.length) return undefined;

  const data = isRecord(payload.data) ? payload.data : {};
  return {
    ...payload,
    data: { ...data, ...chunks[nextIndex] },
    backfillChain: { ...chain, chunkIndex: nextIndex },
  };
}
