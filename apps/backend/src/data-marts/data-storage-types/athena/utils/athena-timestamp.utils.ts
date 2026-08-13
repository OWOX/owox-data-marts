/**
 * `2026-08-12 10:00:00.123 UTC` — how Athena prints `timestamp with time zone` values cast to
 * varchar (Iceberg's `committed_at` is one) — normalised to ISO-8601 UTC with millisecond
 * precision. The fraction and the ` UTC` suffix are both optional. Any OTHER zone suffix
 * returns null — an honest "could not read it" beats silently mislabeling a local time as UTC.
 */
export function athenaTimestampToIsoUtc(value: string | null | undefined): string | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?: UTC|Z|\+00(?::?00)?)?$/.exec(
      value?.trim() ?? ''
    );
  if (!match) {
    return null;
  }
  const millis = (match[3] ?? '').padEnd(3, '0').slice(0, 3);
  return `${match[1]}T${match[2]}.${millis}Z`;
}
