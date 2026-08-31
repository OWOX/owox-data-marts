import type { FormulaViolationDto } from './update-data-mart-schema.response.dto';

/**
 * Response body of `POST /data-marts/:id/schema/validate-formula`. Always 200: a broken formula is
 * an answer, not a failed request. Both lists are scoped to the submitted field — another
 * calculated field's problems belong to its own row.
 */
export interface ValidateFormulaResponseDto {
  /** Violations that would fail the save, all of them. */
  errors: FormulaViolationDto[];
  /** Non-blocking advisories, e.g. an unguarded division. */
  warnings: FormulaViolationDto[];
  /**
   * Violations this formula would cause in ANOTHER calculated field — turning the column `roas`
   * already references into a metric breaks `roas`, and a check that reported only the edited
   * field would say "clean" about an edit the save then refuses.
   *
   * Optional on this side only for resilience: the endpoint always sends it, but absent reads as an
   * empty list — the same "nothing to say" the live channel falls back to everywhere else — so a
   * response from an older backend degrades to silence rather than to a crash.
   */
  otherFieldErrors?: FormulaViolationDto[];
}
