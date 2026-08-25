import type { DataMartResponseDto } from './data-mart.response.dto';

/**
 * A single calculated-field formula violation, as the backend's `FormulaViolation` shape.
 * `field` is the calculated field's NAME (not a column the formula references) — every
 * violation names one.
 */
export interface FormulaViolationDto {
  code: string;
  field: string;
  message: string;
  /**
   * WHAT INSIDE THE FORMULA the violation is about — a reference label (`clicks`,
   * `orders.amount`) or a function name (`SUM`) — published as data so a client can point at it
   * instead of parsing the token back out of `message`. Absent when the violation is about the
   * formula as a whole (a subquery, a stray `;`, an unguarded division): there is no one token to
   * blame, and inventing one would put a marker somewhere arbitrary.
   */
  subject?: string;
}

/**
 * Response body of `PUT /data-marts/:id/schema`. Same as `DataMartResponseDto`, plus non-blocking
 * `warnings` on a SUCCESSFUL save (e.g. an unguarded division, or a dry-run skipped because the
 * warehouse was unreachable) — the schema was persisted; these are advisory only.
 */
export interface UpdateDataMartSchemaResponseDto extends DataMartResponseDto {
  warnings?: FormulaViolationDto[];
}
