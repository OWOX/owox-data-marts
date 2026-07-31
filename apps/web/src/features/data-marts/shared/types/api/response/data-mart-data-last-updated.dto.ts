/**
 * How much of the Data Mart's source set the measurement covers.
 * `partial` means the true time can only be MORE recent than reported.
 */
export type DataLastUpdatedCoverage = 'complete' | 'partial' | 'unavailable';

export interface DataLastUpdatedSourceDto {
  /** `project.dataset.table`, or a `prefix_*` rollup for a sharded set. */
  table: string;
  dataLastUpdatedAt: string | null;
  /** Why this entry is null or approximate. */
  note?: string;
}

/**
 * When the source tables behind a Data Mart last changed in the warehouse.
 *
 * A storage-level write time, NOT the period the data covers: a table rewritten today may hold
 * only backfilled history. `null` means unknown — neither fresh nor stale.
 */
export interface DataLastUpdatedDto {
  dataLastUpdatedAt: string | null;
  /** When the measurement was taken; the UI presents values as "as of computedAt". */
  computedAt: string;
  coverage: DataLastUpdatedCoverage;
  /**
   * Per-table detail. Absent on list and canvas responses, which ship a slim summary so a
   * thousand-row page does not carry ~50 source entries per row; present on the single
   * Data Mart GET and on refresh responses, where the tooltip renders it.
   */
  sources?: DataLastUpdatedSourceDto[];
}

export interface DataLastUpdatedItemDto {
  dataMartId: string;
  dataLastUpdated: DataLastUpdatedDto;
}

/**
 * Requested ids may be missing from `items` when the sweep was cut short or the Data Mart is not
 * visible. A missing id means "no new information" — keep whatever value you already had.
 */
export interface BatchDataLastUpdatedResponseDto {
  items: DataLastUpdatedItemDto[];
}
