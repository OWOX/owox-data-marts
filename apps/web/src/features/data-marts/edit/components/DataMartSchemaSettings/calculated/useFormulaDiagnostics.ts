import { useEffect, useRef, useState } from 'react';
import { extractApiError } from '../../../../../../app/api';
import { dataMartService } from '../../../../shared/services/data-mart.service';
import type { FormulaViolationDto, ValidateFormulaResponseDto } from '../../../../shared/types/api';
import type { DraftCalculatedFieldDto } from '../../../../shared/types/api/request/validate-formula.request.dto';
import { DRAFT_FORMULA_MAX_LENGTH, selectDraftCalculatedFields } from './draft-calculated-fields';

/**
 * How long the analyst has to stop typing before the formula is sent for checking.
 *
 * Not a free parameter: the backend check reads this Data Mart's blendable schema whenever ANY of
 * its calculated fields carries a live joined reference — including one belonging to another row —
 * so a request per keystroke would be a join-tree read per keystroke. 200 ms is short enough to
 * feel immediate and long enough that a burst of typing coalesces into ONE request. This debounce
 * is the only trigger; nothing else may call the endpoint on a shorter path.
 */
export const FORMULA_DIAGNOSTICS_DEBOUNCE_MS = 200;

export interface FormulaDiagnostics {
  /** Violations that would fail the save, for this field only. */
  errors: readonly FormulaViolationDto[];
  /** Non-blocking advisories, e.g. an unguarded division. */
  warnings: readonly FormulaViolationDto[];
  /**
   * Violations this edit would cause in ANOTHER calculated field — converting a column into a
   * metric breaks whatever already referenced it. Nothing about the formula on screen is wrong, so
   * these never mark it up; they say what the save would break. Empty until the endpoint sends the
   * bucket (see `ValidateFormulaResponseDto.otherFieldErrors`).
   */
  otherFieldErrors: readonly FormulaViolationDto[];
  /** A check is scheduled or in flight, so what is on screen may be about an older formula. */
  isChecking: boolean;
  /**
   * The verdict above describes a DIFFERENT formula from the one currently being asked about — the
   * analyst has edited since it was given.
   *
   * The verdict is deliberately kept on screen while the next one is fetched (blanking it on every
   * keystroke makes the panel flicker through a whole edit), and this is what says so. It matters
   * most for the editor markers: a squiggle re-anchored onto the very token the analyst just fixed
   * reads as a fresh accusation, so markers are dropped while this holds and only the text stays,
   * dimmed.
   */
  isStale: boolean;
}

export interface UseFormulaDiagnosticsOptions {
  dataMartId: string;
  /** The name the field would be saved under. */
  name: string;
  /** The field's output type, in the storage's own vocabulary. */
  type: string;
  /** The formula in STORED form (`{{ref}}` tags) — what the endpoint takes, not the typed text. */
  formula: string;
  /**
   * Every calculated field the schema editor is holding (`draft-calculated-fields.ts`). Without it
   * the endpoint resolves a sibling reference against the schema on DISK, and a metric added in
   * this session comes back as "no longer exists in the Data Mart" — about a reference the save
   * then accepts.
   *
   * Deliberately NOT an effect dependency: it is an array, so a fresh identity every render would
   * turn a debounce that exists to coalesce typing into a request per render. It is read when a
   * request is actually built, which is a keystroke apart from any change to it — and the popover
   * that owns this hook is the only editor open, so the set cannot change underneath it anyway.
   */
  calculatedFields?: readonly DraftCalculatedFieldDto[];
  /** Off entirely when false — no timer, no request. Defaults to on. */
  enabled?: boolean;
}

interface Verdict {
  errors: readonly FormulaViolationDto[];
  warnings: readonly FormulaViolationDto[];
  otherFieldErrors: readonly FormulaViolationDto[];
  /** The formula this verdict was given about, so a consumer can tell it apart from the one on
   * screen. Empty when there is no verdict — which is never equal to a formula worth checking. */
  formula: string;
}

const NO_VERDICT: Verdict = { errors: [], warnings: [], otherFieldErrors: [], formula: '' };

/**
 * How many consecutive 4xx answers one open editor tolerates before it stops asking.
 *
 * A 4xx says the REQUEST is unacceptable — an unknown field type, a formula past the endpoint's
 * length bound, a Data Mart this session may not read. None of those fix themselves while the
 * analyst keeps typing, so without a brake each keystroke buys another guaranteed failure. Kept
 * per open popover (not module-wide): closing and reopening the editor is a deliberate gesture and
 * gets a fresh start, and a 4xx on one metric must not silence another. Server and network
 * failures do NOT count — those are transient and worth retrying.
 */
const CONSECUTIVE_CLIENT_ERROR_LIMIT = 3;

/**
 * Whether this session has been told it may not ask at all.
 *
 * A view-only session is a TOKEN claim, orthogonal to role: it can carry `editor` and still be
 * refused every state-changing request by the IDP guard — and this check is a POST, so it is
 * refused. Nothing about that is a fact about the formula, and retrying it every 200 ms for the
 * rest of the session is a request per keystroke that can only ever fail. Module scope on purpose:
 * the answer belongs to the session, not to one open editor, so reopening the popover or editing a
 * different metric must not start the useless traffic again. Cleared only by a reload.
 *
 * The code is the literal `useCalculatedFieldSave.ts` already matches on — `@owox/idp-protocol`,
 * which declares it, is not a dependency of the web app.
 */
let sessionRefused = false;

function isSessionRefusal(error: unknown): boolean {
  const apiError = extractApiError(error);
  return apiError.statusCode === 403 && apiError.code === 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE';
}

/**
 * A 4xx — the request itself was refused, so repeating it unchanged is pointless. An aborted
 * request lands in the same `catch` and is deliberately NOT one of these: it carries no response
 * at all, and cancelling our own request must never count against the editor.
 */
function isClientError(error: unknown): boolean {
  const status = extractApiError(error).statusCode;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * What the backend thinks of the formula the analyst is typing, asked without saving anything and
 * without touching the warehouse (`POST /data-marts/:id/schema/validate-formula`).
 *
 * This channel is HELP, never a gate. Its answer is asynchronous, so gating Apply on it would race
 * a stale verdict — edit, press Apply before the response lands, and the button would be reflecting
 * the previous formula. The synchronous local name check keeps that job, and the save path runs
 * these same rules again and refuses when it must.
 *
 * Ordering is enforced by the effect's own cleanup rather than by comparing sequence numbers: React
 * runs the cleanup of the previous effect before the next one, so a response that arrives after the
 * formula changed finds its `superseded` flag already set and returns without touching state. The
 * AbortController on top of it means the superseded request is not merely ignored but cancelled.
 */
export function useFormulaDiagnostics({
  dataMartId,
  name,
  type,
  formula,
  calculatedFields,
  enabled = true,
}: UseFormulaDiagnosticsOptions): FormulaDiagnostics {
  const [verdict, setVerdict] = useState<Verdict>(NO_VERDICT);
  const [isChecking, setIsChecking] = useState(false);
  // A ref, not state: it must not re-render anything, and the effect below reads it as it runs.
  const consecutiveClientErrors = useRef(0);
  const calculatedFieldsRef = useRef(calculatedFields);
  calculatedFieldsRef.current = calculatedFields;

  // Everything the request needs must be there, or the endpoint answers 400 about a field the
  // analyst has not finished creating yet (a metric's row exists before it is named).
  const active =
    enabled &&
    !sessionRefused &&
    consecutiveClientErrors.current < CONSECUTIVE_CLIENT_ERROR_LIMIT &&
    dataMartId !== '' &&
    name.trim() !== '' &&
    type.trim() !== '' &&
    formula.trim() !== '';

  // The endpoint refuses a formula past this bound, and so does the schema save (the same number
  // guards both). Asking anyway costs three 4xx answers and then the check for the rest of the
  // session, and an empty panel reads as "your formula is clean".
  const isTooLong = formula.length > DRAFT_FORMULA_MAX_LENGTH;

  useEffect(() => {
    if (!active) {
      // No formula, no verdict: whatever the last one said, it was about something else.
      setVerdict(NO_VERDICT);
      setIsChecking(false);
      return;
    }

    if (isTooLong) {
      // The one violation this hook mints itself. Everything else here is the backend's word, but
      // this is a fact about the REQUEST rather than a claim about the SQL — and saying nothing is
      // the one answer that would be read as approval.
      setVerdict({
        errors: [
          {
            code: 'FORMULA_TOO_LONG',
            field: name,
            message:
              `This formula is too long: ${String(formula.length)} characters against a limit of ` +
              `${String(DRAFT_FORMULA_MAX_LENGTH)}. It cannot be checked or saved as it is.`,
          },
        ],
        warnings: [],
        otherFieldErrors: [],
        formula,
      });
      setIsChecking(false);
      return;
    }

    let superseded = false;
    const controller = new AbortController();
    setIsChecking(true);

    const timer = setTimeout(() => {
      // Omitted when there is nothing to report, never sent empty: the endpoint reads an empty
      // list and an absent one alike (fall back to the persisted schema), and that is the answer a
      // caller with no draft needs — sending `[]` as "no formulas exist" would delete every
      // persisted sibling from the check.
      const drafted = selectDraftCalculatedFields(calculatedFieldsRef.current ?? [], formula);
      const body = drafted.fields.length
        ? { name, type, formula, calculatedFields: drafted.fields }
        : { name, type, formula };
      void dataMartService
        .validateFormula(dataMartId, body, { signal: controller.signal })
        .then(response => {
          if (superseded) return;
          // The service CASTS the body rather than mapping it, so the declared shape is a claim
          // about the wire and not a fact — the same reason `useBlendableSchema` normalizes its
          // arrays. A missing list here would reach `.map` in the editor.
          const {
            errors = [],
            warnings = [],
            otherFieldErrors = [],
          } = response as Partial<ValidateFormulaResponseDto>;
          consecutiveClientErrors.current = 0;
          setVerdict({
            errors,
            warnings,
            // The probe is judged WHOLE, so a draft that had to be cut makes every kept formula
            // reading a dropped one report its own breakage — accusations about rows the analyst
            // never touched, invented by the cut. This bucket's correctness rests on the probe
            // being the whole schema, so when it is not, it is withheld rather than shown.
            otherFieldErrors: drafted.isTruncated ? [] : otherFieldErrors,
            formula,
          });
          setIsChecking(false);
        })
        .catch((error: unknown) => {
          // Both recorded even for a superseded request: what they learned is about the session
          // and about this editor, not about the formula that request happened to be carrying.
          if (isSessionRefusal(error)) sessionRefused = true;
          if (isClientError(error)) consecutiveClientErrors.current += 1;
          if (superseded) return;
          // Offline, 5xx, a role that cannot ask — none of that is a fact about the formula, and
          // inventing one would send the analyst hunting for a mistake they did not make. The
          // previous verdict goes too: it described a formula that is no longer on screen.
          setVerdict(NO_VERDICT);
          setIsChecking(false);
        });
    }, FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    return () => {
      superseded = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, isTooLong, dataMartId, name, type, formula]);

  return {
    errors: verdict.errors,
    warnings: verdict.warnings,
    otherFieldErrors: verdict.otherFieldErrors,
    isChecking,
    isStale: verdict.formula !== '' && verdict.formula !== formula,
  };
}
