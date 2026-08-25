import type { CalculatedFieldLevel } from '../../calculated-fields/formula-level';
import { ReportAggregateFunction } from '../schemas/aggregate-function.schema';
import { StorageFieldType } from './storage-field-type';

/**
 * Represents a single report data header with metadata
 */
export class ReportDataHeader {
  constructor(
    /**
     * The name of the header
     */
    public readonly name: string,

    /**
     * Optional alias for the header
     */
    public readonly alias?: string,

    /**
     * Optional description of the header
     */
    public readonly description?: string,

    /**
     * The storage field type
     */
    public readonly storageFieldType?: StorageFieldType,

    /**
     * The aggregate function applied to the field (if any)
     */
    public readonly aggregateFunction?: ReportAggregateFunction,

    /**
     * Set exactly when this header is a CALCULATED FIELD — a value the warehouse computed from the
     * analyst's own formula (spec §2.1), not a projection of one column through one report
     * aggregation — and then it carries the level that formula was DERIVED to have.
     *
     * A formula carries no report aggregate function of its OWN (no single one describes it), and a
     * bare `undefined` there is how an ordinary native column looks, so this is the only thing that
     * separates the three cases:
     * - `undefined` — an ordinary native column. Looker reads it as METRIC + defaultAggregation SUM
     *   + isReaggregatable for a numeric type.
     * - `'metric'` — the formula AGGREGATES. Re-aggregating `SUM(clicks) / NULLIF(SUM(impressions),
     *   0)` is wrong at any grain, so consumers must not roll it up (spec §8 — Looker's semantics
     *   for it copy COUNT_DISTINCT), whatever its declared type says.
     * - `'column'` — the formula is ROW-LEVEL: a dimension (spec §4.5). It behaves like a native
     *   column of its declared type and is meant to be grouped by. It is still NOT a native column,
     *   which is why it is marked here rather than left undefined: it has no warehouse column
     *   behind it, and consumers that resolve one by name (filters, MCP field lookups) need to see
     *   the difference.
     *
     * A ROW-LEVEL field the REPORT aggregates (#6732) is the one case carrying both: the header is
     * named `<field> | <TOKEN>` and holds that `aggregateFunction`, because the query aggregated it
     * and it is no longer a grouping key — while this level still says no warehouse column backs it.
     */
    public readonly calculatedFieldLevel?: CalculatedFieldLevel
  ) {}
}
