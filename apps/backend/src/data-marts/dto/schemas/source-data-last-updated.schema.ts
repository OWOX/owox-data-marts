import { z } from 'zod';

/**
 * How much of the query's source set the answer actually covers.
 *
 * - `complete`   — every source table was resolved to a modification time.
 * - `partial`    — at least one source is missing or unknowable (metadata call failed, the
 *                  table is EXTERNAL, or the warehouse truncated its referenced-table list).
 *                  `dataLastUpdatedAt` is a MAX over what WAS resolved, so it can only be older
 *                  than the truth, never newer.
 * - `unavailable` — nothing could be resolved; `dataLastUpdatedAt` is null.
 */
export const SourceDataLastUpdatedCoverage = ['complete', 'partial', 'unavailable'] as const;

export const SourceDataLastUpdatedEntrySchema = z.object({
  /** `project.dataset.table`, or `dataset.prefix_*` for a sharded set collapsed into one entry. */
  table: z.string(),
  dataLastUpdatedAt: z.string().nullable(),
  /** Why this entry is null or approximate. Absent when the value is a plain resolved time. */
  note: z.string().optional(),
});

export const SourceDataLastUpdatedSchema = z.object({
  /**
   * MAX over `sources[]` — the most recent moment any source table's DATA changed at the
   * warehouse. `null` means unknown, which is a legitimate answer and must never be presented
   * as "the data is fresh" or "the data is stale".
   */
  dataLastUpdatedAt: z.string().nullable(),
  /** When this snapshot was taken; it is computed per run and never cached. */
  computedAt: z.string(),
  coverage: z.enum(SourceDataLastUpdatedCoverage),
  sources: z.array(SourceDataLastUpdatedEntrySchema),
});

export type SourceDataLastUpdatedEntry = z.infer<typeof SourceDataLastUpdatedEntrySchema>;
export type SourceDataLastUpdated = z.infer<typeof SourceDataLastUpdatedSchema>;
