/**
 * One entry of the validator's structured error list. Only `code` is guaranteed; the rest
 * depend on the rule that failed. `message` is present when the backend wrote a sentence for
 * a human (e.g. an unsupported output-controls combination) — prefer it over the code.
 */
export interface ApiValidationError {
  code?: string;
  column?: string;
  /** OUTPUT_COLUMN_NAME_COLLISION names the colliding OUTPUT name here, not in `column`. */
  label?: string;
  function?: string;
  type?: string;
  operator?: string;
  aliasPath?: string;
  message?: string;
}

/**
 * One entry of the calculated-field formula validator's structured violation list — the
 * `errorDetails.errors` envelope `UpdateDataMartSchemaService` throws via
 * `BusinessViolationException('Calculated field validation failed', { errors })`. `field` is the
 * CALCULATED FIELD's name (not a column the formula references), and every violation names one.
 */
export interface ApiFormulaViolation {
  code?: string;
  field?: string;
  message?: string;
}

export interface ApiError {
  code?: string;
  message?: string;
  path: string;
  statusCode: number;
  timestamp: string;
  /** Present on an unhandled (non-HTTPException) 5xx body — the only handle support has to find
   * the matching server log (see apiClient.ts's response interceptor). */
  requestId?: string;
  /**
   * Envelope used by `BusinessViolationException` (via the backend's exception filter). `error`
   * is a single free-text string; `errors` is the calculated-field validator's structured list
   * (see `ApiFormulaViolation`) — two different callers of the same exception, two different
   * shapes under the same key.
   */
  errorDetails?: { error?: string; errors?: ApiFormulaViolation[] };
  /**
   * Envelope used by the output-controls validator, which throws
   * `BadRequestException({ message, details: { errors } })` — a different key AND a different
   * shape from `errorDetails`. Without this the entire list was dropped and the user saw only
   * "Output controls validation failed", which names neither the column nor what to change.
   */
  details?: { errors?: ApiValidationError[] };
}
