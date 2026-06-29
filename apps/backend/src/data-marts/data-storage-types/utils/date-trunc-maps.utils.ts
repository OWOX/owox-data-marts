import { DateTruncRule, DateTruncUnit } from '../../dto/schemas/date-trunc-config.schema';

/** column → calendar unit, for feeding `renderAggregatedSelect`. */
export function buildDateTruncUnitMap(
  dateTruncs: readonly DateTruncRule[]
): ReadonlyMap<string, DateTruncUnit> {
  return new Map(dateTruncs.map(d => [d.column, d.unit]));
}

/**
 * column → IANA time zone, only for rules that carry one. Returns undefined when no
 * rule has a time zone so the no-tz SQL path (and its byte-identical output) is hit.
 */
export function buildTimeZoneMap(
  dateTruncs: readonly DateTruncRule[]
): ReadonlyMap<string, string> | undefined {
  const entries = dateTruncs
    .filter((d): d is DateTruncRule & { timeZone: string } => d.timeZone != null)
    .map(d => [d.column, d.timeZone] as const);
  return entries.length ? new Map(entries) : undefined;
}
