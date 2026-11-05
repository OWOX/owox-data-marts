/**
 * Reads a manual-backfill date the way the connector engine does.
 *
 * A deliberate mirror of AbstractConnector._parseDate: the calendar date is taken from the
 * YYYY-MM-DD prefix and any time part is ignored, which pins the value to UTC midnight and
 * takes the day the customer wrote literally. 1-2 digit month/day components are accepted
 * because stored run forms send them; a 1-3 digit year is not, because Date.UTC would map
 * it into 19xx. Out-of-range components (2026-13-45) roll over, as they do in the engine.
 *
 * Rejecting anything the engine would have accepted would turn a working request into a
 * 400, so this stays in step with it rather than tightening it.
 *
 * @returns milliseconds since epoch at UTC midnight, or NaN when the value is unreadable
 */
function parseBackfillDate(value: unknown): number {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? NaN
      : Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    const asDate = new Date(value);
    return Date.UTC(asDate.getUTCFullYear(), asDate.getUTCMonth(), asDate.getUTCDate());
  }

  if (typeof value !== 'string') return NaN;

  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt ].*)?$/.exec(value.trim());
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Reports the first problem with a manual-backfill window, mirroring the checks in
 * AbstractConnector._getManualBackfillDateRange so a bad window is a 400 instead of a run
 * that starts and then dies.
 *
 * Two engine behaviours are mirrored rather than improved on. A falsy value is passed over:
 * the engine reads it as "not supplied" and owns the decision of whether it was required,
 * which varies by connector -- not every connector even has a time-series node. And an
 * EndDate in the future is accepted, because the engine warns and clamps it to today.
 *
 * @returns the message to reject with, or null when the window is usable
 */
export function manualBackfillWindowError(
  data: Record<string, unknown>,
  options: { includeValues?: boolean } = {}
): string | null {
  const includeValues = options.includeValues !== false;
  const startDate = data.StartDate;
  const endDate = data.EndDate;

  const startMs = startDate ? parseBackfillDate(startDate) : null;
  const endMs = endDate ? parseBackfillDate(endDate) : null;

  if (startMs !== null && Number.isNaN(startMs)) {
    return unreadableDateMessage('StartDate', startDate, includeValues);
  }
  if (endMs !== null && Number.isNaN(endMs)) {
    return unreadableDateMessage('EndDate', endDate, includeValues);
  }

  if (startMs !== null && endMs !== null && endMs < startMs) {
    return includeValues
      ? `EndDate (${String(endDate)}) cannot be earlier than StartDate (${String(startDate)})`
      : 'EndDate cannot be earlier than StartDate.';
  }

  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (startMs !== null && startMs > todayMs) {
    return includeValues
      ? `StartDate (${String(startDate)}) cannot be in the future`
      : 'StartDate cannot be in the future.';
  }

  return null;
}

function unreadableDateMessage(field: string, value: unknown, includeValues: boolean): string {
  return (
    `${field}${includeValues ? ` (${String(value)})` : ''} is not a valid date. Use YYYY-MM-DD (e.g. 2024-01-15) or an ` +
    `ISO-8601 timestamp (e.g. 2024-01-15T00:00:00.000Z).`
  );
}
