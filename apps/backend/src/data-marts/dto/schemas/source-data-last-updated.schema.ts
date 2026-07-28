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

/**
 * The "we could not determine it" answer, in one place.
 *
 * Every producer of this block needs it, and hand-building the literal per call site lets the
 * shape drift away from the schema it claims to satisfy — which matters because the value is
 * persisted through a zod transformer that will reject a stale shape.
 */
export function unavailableSourceDataLastUpdated(
  computedAt: string = new Date().toISOString()
): SourceDataLastUpdated {
  return { dataLastUpdatedAt: null, computedAt, coverage: 'unavailable', sources: [] };
}

/**
 * List-shaped view of the block: everything a row or canvas badge renders, without the
 * per-table `sources` detail.
 *
 * Lists page up to a thousand Data Marts and each block can carry ~50 source entries, so
 * shipping the full block per row would add megabytes to a single list response for detail no
 * list surface displays. The full block stays on the single-Data-Mart GET and the refresh
 * endpoints, where the tooltip actually shows it.
 */
export type SourceDataLastUpdatedSummary = Omit<SourceDataLastUpdated, 'sources'>;

export function toSourceDataLastUpdatedSummary(
  block: SourceDataLastUpdated | null | undefined
): SourceDataLastUpdatedSummary | null {
  if (!block) return null;
  const { dataLastUpdatedAt, computedAt, coverage } = block;
  return { dataLastUpdatedAt, computedAt, coverage };
}
