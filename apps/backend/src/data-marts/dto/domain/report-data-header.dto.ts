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
     * Set exactly when this header is a CALCULATED FIELD, carrying the level its formula was
     * derived to have. A formula carries no report aggregate function of its own, and `undefined`
     * there is also how a native column looks, so this is the only thing separating the cases:
     * - `undefined` — an ordinary native column. Looker reads it as METRIC + defaultAggregation SUM
     *   + isReaggregatable for a numeric type.
     * - `'metric'` — the formula AGGREGATES. Re-aggregating `SUM(clicks) / NULLIF(SUM(impressions),
     *   0)` is wrong at any grain, so consumers must not roll it up, whatever its declared type says.
     * - `'column'` — the formula is ROW-LEVEL and behaves like a column of its declared type. Still
     *   marked rather than left undefined: no warehouse column backs it, and consumers that resolve
     *   one by name (filters, MCP field lookups) need to see the difference.
     *
     * A row-level field the REPORT aggregates carries both: the header is named `<field> | <TOKEN>`
     * and holds that `aggregateFunction`, while this level still says no column backs it.
     */
    public readonly calculatedFieldLevel?: CalculatedFieldLevel
  ) {}
}
