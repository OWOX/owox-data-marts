import { useCallback, useState } from 'react';
import { extractApiError, type ApiFormulaViolation } from '../../../../../../app/api';
import { showApiErrorToast } from '../../../../../../shared/utils';
import type { DataMartSchema } from '../../../../shared/types/data-mart-schema.types';

/** Every message the backend returned for one calculated field, in the order it sent them. */
export type ViolationsByField = Record<string, string[]>;

/** The subset of the schema-save response this hook actually reads. */
export interface CalculatedFieldSaveOutcome {
  warnings?: ApiFormulaViolation[];
}

export interface UseCalculatedFieldSaveResult {
  /** Runs `mutation`, then updates `errorsByField`/`warningsByField` from its outcome. Rejects
   * with whatever `mutation` rejected with — callers that need the failure (e.g. to skip a
   * follow-up step) still see it. */
  save: (schema: DataMartSchema) => Promise<void>;
  /** Every calculated-field formula error from the last save attempt, grouped by field NAME —
   * the whole set the backend reported, not just the first. Empty once a save succeeds, or once
   * an API rejection carries no such errors at all (an unrelated failure). */
  errorsByField: ViolationsByField;
  /** Non-blocking formula warnings from the last SUCCESSFUL save, grouped by field name. The
   * save already persisted — these are advisory, and must never read as a failure. */
  warningsByField: ViolationsByField;
  /** Clears both maps — e.g. when the user discards their edits and the last outcome no longer
   * applies to anything on screen. */
  reset: () => void;
}

const EMPTY: ViolationsByField = {};

/**
 * Groups a violation list by its `field` (the calculated field's NAME), preserving the order
 * fields first appear in — the backend reports every violation across every calculated field in
 * one response, and a field can carry more than one.
 *
 * A violation naming a field no longer in the current schema (the response can race an edit) is
 * grouped exactly like any other — this function never checks the violation's field against a
 * live schema, so a stale/unmatched name still gets its own entry instead of being dropped.
 *
 * `violations` is UNTRUSTED runtime data despite its declared type — same hazard
 * `showApiErrorToast.ts` guards its own `errors` list against. A non-array value here (a
 * malformed body) must not throw: this runs inside `save`'s `catch` block, and an uncaught
 * exception there would replace the original rejection and skip the `throw error` below it,
 * leaving the caller with no failure at all instead of the fallback toast.
 */
function groupByField(violations: ApiFormulaViolation[] | undefined): ViolationsByField {
  if (!Array.isArray(violations) || violations.length === 0) return EMPTY;
  const grouped: ViolationsByField = {};
  for (const violation of violations) {
    const field = violation.field?.trim();
    const message = violation.message?.trim();
    if (!field || !message) continue;
    (grouped[field] ??= []).push(message);
  }
  return grouped;
}

/**
 * The one-line summary of a rejected save, for a surface that can only render a string — today the
 * unsaved-changes dialog, which otherwise shows axios's own "Request failed with status code 400".
 * Returns undefined when the rejection carries no formula violations, so the caller keeps its own
 * wording for an unrelated failure.
 */
export function rejectedFormulaMessage(error: unknown): string | undefined {
  const violations = extractApiError(error).errorDetails?.errors;
  const fields = Object.keys(groupByField(violations));
  if (fields.length === 0) return undefined;
  // Not "the warehouse rejected": the same list carries refusals the parser made before any
  // warehouse was asked, and a storage that is not configured yet is never asked at all.
  return `The save was rejected for ${fields.join(', ')}. Close this dialog to see why.`;
}

/**
 * Mirrors `apiClient.ts`'s response interceptor for 403/404/5xx. `save` always sets
 * `skipErrorToast` on its underlying request (this hook renders its own field-grouped feedback
 * for the 400 case instead), so a failure that ISN'T a calculated-field violation gets NO toast
 * at all unless something here reproduces the interceptor's own wording — including the
 * view-only-mode phrasing on a 403, and the request id a 5xx's `persistent`, correlation-bearing
 * message depends on for support to find the matching server log.
 */
function showFallbackErrorToast(error: unknown): void {
  const apiError = extractApiError(error);
  if (apiError.statusCode === 403) {
    const message =
      apiError.code === 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE'
        ? 'This action is not available in view-only mode'
        : 'Access forbidden - insufficient permissions';
    showApiErrorToast(error, message, { persistent: true });
    return;
  }
  if (apiError.statusCode === 404) {
    showApiErrorToast(error, 'Resource not found');
    return;
  }
  if (apiError.statusCode >= 500) {
    showApiErrorToast(
      undefined,
      apiError.requestId
        ? `Something went wrong on our side. Request id: ${apiError.requestId}`
        : 'Something went wrong on our side. Please try again',
      { id: `server-error:${apiError.statusCode}` }
    );
    return;
  }
  // A 400 with no calculated-field `errors` (a different validation failure), or anything else
  // unclassified — the app's own generic fallback.
  showApiErrorToast(error);
}

/**
 * Wraps a schema-save mutation to give the backend's calculated-field formula feedback a home:
 * every violation on a rejected (400) save, grouped by field; non-blocking warnings on a
 * successful one. Before this, a 400 rendered one generic "Bad request" toast with no per-field
 * detail, and a successful save's warnings were dropped entirely.
 *
 * `mutation` is injected rather than called directly against the API: the caller owns how the
 * save actually happens (which data mart, which context dispatch, which success toast) and this
 * hook only interprets the outcome, which keeps it trivial to unit test.
 */
export function useCalculatedFieldSave(
  mutation: (schema: DataMartSchema) => Promise<CalculatedFieldSaveOutcome | undefined>
): UseCalculatedFieldSaveResult {
  const [errorsByField, setErrorsByField] = useState<ViolationsByField>(EMPTY);
  const [warningsByField, setWarningsByField] = useState<ViolationsByField>(EMPTY);

  const reset = useCallback(() => {
    setErrorsByField(EMPTY);
    setWarningsByField(EMPTY);
  }, []);

  const save = useCallback(
    async (schema: DataMartSchema): Promise<void> => {
      try {
        const result = await mutation(schema);
        // The save succeeded — any error from a previous attempt no longer applies.
        setErrorsByField(EMPTY);
        setWarningsByField(groupByField(result?.warnings));
      } catch (error) {
        const violations = extractApiError(error).errorDetails?.errors;
        const grouped = groupByField(violations);
        // A failed save never persisted — a previous save's warnings describe state that no
        // longer matches what's on screen.
        setWarningsByField(EMPTY);
        if (Object.keys(grouped).length > 0) {
          setErrorsByField(grouped);
        } else {
          // Not a calculated-field violation — an unrelated failure (a different validation
          // error, a network blip, a 5xx). Nothing to group by field, so fall back to a toast —
          // matching whatever the suppressed apiClient interceptor would have shown.
          setErrorsByField(EMPTY);
          showFallbackErrorToast(error);
        }
        throw error;
      }
    },
    [mutation]
  );

  return { save, errorsByField, warningsByField, reset };
}
