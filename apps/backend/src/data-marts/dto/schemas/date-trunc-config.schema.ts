import { z } from 'zod';

// Keep these units in sync with the public traversal rule literals in
// `packages/api-client/src/data-marts.ts`.
/**
 * Calendar bucket a date/timestamp dimension is truncated to. Week-start day and
 * timezone normalization are out of scope for this slice — WEEK semantics (which
 * weekday a week starts on) differ per dialect and are not normalized here.
 */
export const DATE_TRUNC_UNITS = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const;
export type DateTruncUnit = (typeof DATE_TRUNC_UNITS)[number];

/**
 * Shape of an IANA time-zone name (e.g. `UTC`, `America/New_York`, `Etc/GMT+5`).
 * This value is INLINED into the generated SQL as a string literal — it is NOT a
 * bound parameter — so this pattern is a hard SQL-injection guard. It forbids
 * quotes, spaces, semicolons and any character that could break out of the literal.
 * NEVER relax it.
 */
export const IANA_TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

export const DateTruncRuleSchema = z.object({
  column: z.string().min(1),
  unit: z.enum(DATE_TRUNC_UNITS),
  // Optional per-rule time zone. When set, the value is converted to this zone
  // BEFORE truncation so e.g. "revenue by month" buckets in the user's zone.
  timeZone: z.string().min(1).regex(IANA_TIME_ZONE_PATTERN, 'Invalid IANA time zone').optional(),
});

export const DateTruncConfigSchema = z.array(DateTruncRuleSchema).nullable();

export type DateTruncRule = z.infer<typeof DateTruncRuleSchema>;
export type DateTruncConfig = z.infer<typeof DateTruncConfigSchema>;
