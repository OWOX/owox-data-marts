/**
 * `2025-11-18 15:44:34.856073` — the shape Redshift reports timestamps in over the Data API
 * (values are UTC, printed without a zone) — converted to ISO-8601 with millisecond precision.
 *
 * A trailing UTC marker (`Z`, `+00`, `+0000`, `+00:00`) is tolerated in case a driver or a
 * future Redshift release starts appending one. Anything else — a NON-zero offset included —
 * returns null: an honest "could not read it" beats silently mislabeling a local time as UTC.
 */
export function redshiftTimestampToIsoUtc(value: string | null | undefined): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|\+00(?::?00)?)?$/.exec(
    value?.trim() ?? ''
  );
  if (!match) {
    return null;
  }
  const millis = (match[3] ?? '').padEnd(3, '0').slice(0, 3);
  return `${match[1]}T${match[2]}.${millis}Z`;
}
