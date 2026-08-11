import { z } from 'zod';

// `boolean` is the legacy shape (main Data Mart only) and is still accepted from saved reports and
// from API clients; `string[]` is the per-source form. See `normalizeUniqueCountSources`.
export const UniqueCountConfigSchema = z.union([z.boolean(), z.array(z.string())]).nullable();

export type UniqueCountConfig = z.infer<typeof UniqueCountConfigSchema>;

/**
 * How many sources one report may ask a `COUNT(DISTINCT …)` of. Every entry costs its own CTE,
 * `LEFT JOIN` and sleeve in the emitted SQL, so an unbounded list is a resource cliff rather than
 * an injection risk (paths are still checked against the resolved `availableSources`).
 *
 * 50 matches the cap its sibling request configs already carry — `filterConfig`,
 * `aggregationConfig` and `dateTruncConfig` are all `@ArrayMaxSize(50)`. `sortConfig`'s tighter 10
 * does not transfer: that one bounds a list where the entries past the first few cannot change the
 * result, while each source here is a distinct metric a report may legitimately want. The source
 * list is derived from the relationship tree and is single-digit in practice, so 50 cannot truncate
 * a real configuration while still bounding an adversarial payload to a fixed number of joins.
 */
export const UNIQUE_COUNT_CONFIG_MAX_SOURCES = 50;

/**
 * Request-side shape: the same union, capped. Deliberately NOT the shape the entity persists —
 * `report.entity.ts` re-parses through `UniqueCountConfigSchema` on READ as well as on write, so a
 * cap there would turn an over-cap row from unsavable into unreadable, with no way out through the UI.
 */
export const UniqueCountConfigRequestSchema = z
  .union([z.boolean(), z.array(z.string()).max(UNIQUE_COUNT_CONFIG_MAX_SOURCES)])
  .nullable();

/**
 * The published OpenAPI shape of a `uniqueCountConfig` REQUEST field. One definition rather than
 * three copies: the request DTOs' `@ApiProperty` never reaches the document (the controller serves
 * a hand-written body schema via `@ApiBody`), so the two drifted unnoticed — the cap lived only in
 * the copy nobody publishes. The RESPONSE shape stays separate and uncapped, mirroring the read
 * path described above.
 */
export const UNIQUE_COUNT_CONFIG_REQUEST_OPENAPI = {
  oneOf: [
    { type: 'boolean' },
    { type: 'array', items: { type: 'string' }, maxItems: UNIQUE_COUNT_CONFIG_MAX_SOURCES },
  ],
  nullable: true,
  description:
    'Unique Count sources. `true` (legacy) counts distinct primary keys of the main Data Mart; ' +
    'an array lists source alias paths, where an empty string denotes the main Data Mart.',
};
