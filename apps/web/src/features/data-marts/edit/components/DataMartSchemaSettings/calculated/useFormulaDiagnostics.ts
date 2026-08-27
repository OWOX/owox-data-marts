import { useEffect, useRef, useState } from 'react';
import { extractApiError } from '../../../../../../app/api';
import { dataMartService } from '../../../../shared/services/data-mart.service';
import type { FormulaViolationDto, ValidateFormulaResponseDto } from '../../../../shared/types/api';
import type { DraftCalculatedFieldDto } from '../../../../shared/types/api/request/validate-formula.request.dto';
import { DRAFT_FORMULA_MAX_LENGTH, selectDraftCalculatedFields } from './draft-calculated-fields';

/**
 * How long the analyst has to stop typing before the formula is sent for checking.
 *
 * Not a free parameter: the backend check reads this Data Mart's blendable schema whenever any of
 * its calculated fields carries a live joined reference, so a request per keystroke is a join-tree
 * read per keystroke. This debounce is the only trigger.
 */
export const FORMULA_DIAGNOSTICS_DEBOUNCE_MS = 200;

export interface FormulaDiagnostics {
  /** Violations that would fail the save, for this field only. */
  errors: readonly FormulaViolationDto[];
  /** Non-blocking advisories, e.g. an unguarded division. */
  warnings: readonly FormulaViolationDto[];
  /**
   * Violations this edit would cause in ANOTHER calculated field. Nothing about the formula on
   * screen is wrong, so these never mark it up — they say what the save would break.
   */
  otherFieldErrors: readonly FormulaViolationDto[];
  /** A check is scheduled or in flight, so what is on screen may be about an older formula. */
  isChecking: boolean;
  /**
   * The verdict above describes a DIFFERENT formula from the one being asked about — the analyst
   * has edited since it was given. It is kept on screen while the next one is fetched, since
   * blanking it every keystroke makes the panel flicker, but MARKERS are dropped: a squiggle
   * re-anchored onto the token the analyst just fixed reads as a fresh accusation.
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
   * Every calculated field the schema editor is holding. Without it the endpoint resolves a sibling
   * reference against the schema on DISK, and a metric added in this session comes back as "no
   * longer exists in the Data Mart" — about a reference the save then accepts.
   *
   * NOT an effect dependency: a fresh array identity every render would turn a debounce meant to
   * coalesce typing into a request per render. Read when a request is built instead.
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
 * What the panel says once this editor has stopped asking.
 *
 * A WARNING rather than an error: nothing is known to be wrong with the formula — the point is that
 * nobody looked. Left silent, the panel is byte-identical to a clean verdict, which is the reading
 * `isTooLong` below already refuses to allow. Carries no `subject`, so it renders as text under the
 * editor and marks up nothing.
 */
const haltedVerdict = (field: string, formula: string): Verdict => ({
  errors: [],
  warnings: [
    {
      code: 'FORMULA_LIVE_CHECK_UNAVAILABLE',
      field,
      message:
        'Live checking is unavailable in this session, so this formula has not been checked here. ' +
        'It is still checked when you save.',
    },
  ],
  otherFieldErrors: [],
  formula,
});

/**
 * How many consecutive 4xx answers one open editor tolerates before it stops asking.
 *
 * A 4xx says the REQUEST is unacceptable, and none of those causes fix themselves while the analyst
 * keeps typing. Kept per open popover rather than module-wide, so reopening the editor gets a fresh
 * start and a 4xx on one metric does not silence another. Server and network failures do NOT count.
 */
const CONSECUTIVE_CLIENT_ERROR_LIMIT = 3;

/**
 * Whether this session has been told it may not ask at all.
 *
 * A view-only session is a TOKEN claim orthogonal to role: it can carry `editor` and still have
 * every state-changing request refused, and this check is a POST. Module scope on purpose — the
 * answer belongs to the session, so reopening the popover must not restart the useless traffic.
 * Cleared only by a reload.
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
 * without touching the warehouse.
 *
 * HELP, never a gate: the answer is asynchronous, so gating Apply on it would race a stale verdict.
 * The synchronous local name check keeps that job, and the save runs these same rules again.
 *
 * Ordering comes from the effect's own cleanup rather than sequence numbers — React runs the
 * previous cleanup first, so a late response finds `superseded` already set. The AbortController
 * on top means the superseded request is cancelled, not merely ignored.
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
  /**
   * That asking has been given up on — STATE, because crossing the limit has to reach the screen.
   * Derived from the ref and the module flag rather than replacing them: the counter is per
   * request and the session flag outlives this popover, while this is what the panel renders.
   *
   * Seeded from `sessionRefused` so a reopened editor does not spend one more refused request
   * relearning what the session already knows.
   */
  const [checksHalted, setChecksHalted] = useState(() => sessionRefused);
  const calculatedFieldsRef = useRef(calculatedFields);
  calculatedFieldsRef.current = calculatedFields;

  // Everything the request needs must be there, or the endpoint answers 400 about a field the
  // analyst has not finished creating yet (a metric's row exists before it is named).
  const active =
    enabled &&
    !checksHalted &&
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
      // Two different silences, and only one of them is honest. Nothing to check yet — no name, no
      // type, no formula — has nothing to say. Having GIVEN UP asking is a fact about the check,
      // and staying quiet about it puts an empty panel under an unchecked formula.
      setVerdict(checksHalted ? haltedVerdict(name, formula) : NO_VERDICT);
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
          // Reset BEFORE the superseded guard, for the same reason the catch below records before
          // it: an answer proves the endpoint still takes this editor's requests, whichever formula
          // it happened to be carrying. Resetting after the guard while the catch counts before it
          // let three refusals interleaved with successes reach the limit and silence the editor
          // for the popover's life.
          consecutiveClientErrors.current = 0;
          if (superseded) return;
          // The service CASTS the body rather than mapping it, so the declared shape is a claim
          // about the wire and not a fact — the same reason `useBlendableSchema` normalizes its
          // arrays. A missing list here would reach `.map` in the editor.
          const {
            errors = [],
            warnings = [],
            otherFieldErrors = [],
          } = response as Partial<ValidateFormulaResponseDto>;
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
          if (sessionRefused || consecutiveClientErrors.current >= CONSECUTIVE_CLIENT_ERROR_LIMIT) {
            setChecksHalted(true);
          }
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
  }, [active, checksHalted, isTooLong, dataMartId, name, type, formula]);

  return {
    errors: verdict.errors,
    warnings: verdict.warnings,
    otherFieldErrors: verdict.otherFieldErrors,
    isChecking,
    isStale: verdict.formula !== '' && verdict.formula !== formula,
  };
}
