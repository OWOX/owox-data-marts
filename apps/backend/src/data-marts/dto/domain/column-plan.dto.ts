/**
 * Snapshot entry describing a single column ODM owned in the imported range
 * on the previous refresh. Persisted as part of the `OWOX_COLUMNS` developer
 * metadata so the next refresh can recover the `name` of a column even when
 * the sheet's row 1 displays a user-friendly `alias` (e.g. set in Output
 * Schema). Columns are always matched by `name` — aliases are display-only.
 */
export class PreviousImportedColumn {
  constructor(
    /** Column name as defined in the SQL output / Output Schema. */
    public readonly name: string,
    /**
     * Display alias rendered in row 1 on the previous refresh, when one was
     * configured. `undefined` when row 1 displayed `name` itself.
     */
    public readonly alias?: string
  ) {}
}

/**
 * Single structural change to apply to the imported column range when refreshing
 * a Google Sheets export. Operations are applied in the order produced by
 * {@link ColumnPlan.ops}; indexes inside each op are valid at the moment of
 * application (i.e. after preceding ops in the same plan).
 */
export class StructuralColumnOp {
  constructor(
    /**
     * Kind of structural change.
     * - `'delete'` removes the column at {@link atIndex} (e.g. removed from SQL).
     * - `'insert'` adds a new empty column at {@link atIndex} that will be
     *   populated by the writer with header + data values.
     */
    public readonly kind: 'insert' | 'delete',

    /**
     * 0-based column index at which the op is applied.
     * Valid at the moment of application (after preceding ops in the plan).
     */
    public readonly atIndex: number,

    /**
     * Column `name` (matches `ReportDataHeader.name`) the op refers to.
     * For `'delete'` — the name being removed; for `'insert'` — the name to be
     * placed at {@link atIndex}.
     */
    public readonly name: string
  ) {}
}

/**
 * Plan describing how to update the imported column range on the destination
 * Google Sheet so that:
 *   - existing user column ordering is preserved;
 *   - new SQL columns are appended to the right edge of the imported range;
 *   - removed SQL columns are deleted from the imported range;
 *   - user content right of the imported range is left untouched.
 *
 * Built by `ColumnPlanBuilder` from three inputs: row-1 of the sheet, the
 * `OWOX_COLUMNS` developer metadata from the previous refresh, and the desired
 * SQL output schema. The plan is purely declarative — it describes WHAT needs
 * to change, not HOW to call the Sheets API.
 */
export class ColumnPlan {
  constructor(
    /**
     * `true` when the plan is being built for a sheet that has not been
     * exported to before (no `OWOX_COLUMNS` metadata, or row 1 is empty).
     * In this case {@link ops} is empty and {@link finalImportedNames} is the
     * SQL output order.
     */
    public readonly isFirstRun: boolean,

    /**
     * Ordered list of column names occupying row-1 cells
     * `[0..lastImportedColIndex]` AFTER {@link ops} are applied.
     * Used by the writer to (a) write header values, (b) place per-cell notes,
     * (c) reorder data rows so they align with the user's column ordering.
     */
    public readonly finalImportedNames: string[],

    /**
     * Structural ops to apply, in execution order. Deletes are emitted first
     * in descending `atIndex` order (so subsequent indexes stay valid), then
     * inserts at the right edge of the imported region in SQL order.
     * Empty on the first run.
     */
    public readonly ops: StructuralColumnOp[],

    /**
     * Map of column name → 0-based final column index in the post-ops layout.
     * Aligned with {@link finalImportedNames}; provided as a precomputed map
     * to avoid repeated `indexOf` calls in batch writes.
     */
    public readonly nameToFinalIndex: ReadonlyMap<string, number>,

    /**
     * 0-based final last imported column index; equals
     * `finalImportedNames.length - 1`. Provided for convenience.
     */
    public readonly lastImportedColIndex: number,

    /**
     * 0-based last imported column index BEFORE ops are applied.
     * Equals `previousOwoxColumns.length - 1` on subsequent runs; `-1` on
     * first run. Used to delineate "user content right of imported range"
     * for fill-down formula capture.
     */
    public readonly prevLastImportedColIndex: number,

    /**
     * Canonical column names occupying the imported row-1 cells
     * `[0..prevLastImportedColIndex]` BEFORE {@link ops} are applied, in their
     * current sheet order (aliases already resolved back to names). Length
     * equals `previousOwoxColumns.length`; empty on the first run.
     *
     * The writer uses this to key the per-column number formats it captures
     * from the sheet before the write back to canonical names, so that a
     * user's date/number/currency format is re-applied to the *same* logical
     * column after the data write — even when a `delete` op shifts that column
     * to a new final index. See `GoogleSheetsReportWriter.captureUserColumnFormats`.
     */
    public readonly currentImportedNames: string[] = []
  ) {}
}
