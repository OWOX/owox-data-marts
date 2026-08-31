/**
 * The calculated fields the schema editor is HOLDING, on their way to the live backend check.
 *
 * The Output Schema editor defers its save: rows are added, renamed and given formulas in local
 * state, and only Save writes any of it. The live check resolves references against the schema it
 * is given, so without this it resolves them against the one on DISK — and the feature's headline
 * flow, `roas = revenue / cost` written in one sitting, comes back as "`revenue` no longer exists
 * in the Data Mart" about a reference the save then accepts.
 */

import { createContext, useContext } from 'react';
import type { DraftCalculatedFieldDto } from '../../../../shared/types/api/request/validate-formula.request.dto';
import { toAuthoringForm } from './formula-authoring';
import type { SchemaField } from './formula-reference-index';

/**
 * The endpoint's own bounds (`ValidateFormulaApiDto`, `@ArrayMaxSize` and `@MaxLength`), held here
 * so a draft that exceeds them is TRIMMED rather than refused.
 *
 * Nothing caps how many calculated fields a schema may hold, and a formula applied in this session
 * has never been past the save's length check — so both bounds are reachable from the editor. A
 * request that breaks one is answered 400, three consecutive 4xx answers stop the live check for
 * the rest of the session (`useFormulaDiagnostics`), and the diagnostics panel then sits empty,
 * which reads as "your formula is clean" — the failure `unknownFieldTypeViolation` calls the
 * loudest possible bug in the quietest possible way. So a draft past either bound is cut down
 * (`selectDraftCalculatedFields`) rather than sent and refused. Kept in step with the backend by
 * `backend-mirror.test.ts`.
 */
export const MAX_DRAFT_CALCULATED_FIELDS = 100;
export const DRAFT_FORMULA_MAX_LENGTH = 10_000;

/**
 * Top level only. A calculated field is always top-level — every save path's schema parser refuses
 * a dotted calculated name — so descending would be looking for a shape no schema can hold.
 *
 * A row is skipped until it has a name, a type and a formula. Not tidiness: the endpoint requires
 * all three of every entry, so one unfinished row would 400 the whole request (see above). "Add
 * calculated field" appends exactly such a row and leaves it for the analyst to fill in.
 */
export function collectDraftCalculatedFields(
  fields: readonly SchemaField[] | undefined
): DraftCalculatedFieldDto[] {
  const drafted: DraftCalculatedFieldDto[] = [];
  for (const field of fields ?? []) {
    const formula = field.calculated?.formula;
    if (!formula?.trim() || formula.length > DRAFT_FORMULA_MAX_LENGTH) continue;
    if (typeof field.name !== 'string' || !field.name.trim()) continue;
    if (typeof field.type !== 'string' || !field.type.trim()) continue;
    drafted.push({ name: field.name, type: field.type, formula });
  }
  return drafted;
}

/**
 * The draft as one request may carry it: untouched while it fits, and otherwise cut down to the
 * endpoint's count with the formula being CHECKED deciding what survives.
 *
 * Order matters here in a way it does not usually, because a dropped entry is not merely
 * unresolved. The probe REPLACES the persisted formulas, so an entry left out disappears from the
 * check even when it is saved on disk, and the answer is the same sentence a genuinely deleted
 * field gets — "`z` no longer exists in the Data Mart" — with the completion menu still offering
 * `z`, a marker on the token, and Save succeeding. The analyst cannot tell that apart from the
 * truth, so the one formula that must never be cut is the one they are looking at.
 *
 * Its whole dependency CLOSURE, not just the names it spells: `roas` reads `revenue`, `revenue`
 * reads `net`, and dropping `net` breaks `revenue` and so `roas`. The walk is breadth-first from
 * the submitted formula and cannot loop — a name already selected is never queued again, which
 * also makes a cyclic draft (refused by the save, but typeable) terminate here rather than hang.
 */
export function selectDraftCalculatedFields(
  drafted: readonly DraftCalculatedFieldDto[],
  formula: string
): { fields: readonly DraftCalculatedFieldDto[]; isTruncated: boolean } {
  if (drafted.length <= MAX_DRAFT_CALCULATED_FIELDS) {
    return { fields: drafted, isTruncated: false };
  }

  const byName = new Map(drafted.map(entry => [entry.name, entry]));
  const selected = new Map<string, DraftCalculatedFieldDto>();
  const queue = ownFieldNamesIn(formula);
  for (let i = 0; i < queue.length && selected.size < MAX_DRAFT_CALCULATED_FIELDS; i++) {
    const name = queue[i];
    if (selected.has(name)) continue;
    const entry = byName.get(name);
    if (!entry) continue;
    selected.set(name, entry);
    queue.push(...ownFieldNamesIn(entry.formula));
  }

  // Whatever room is left goes to the rest in schema order, so the cut stays in the same place
  // between two keystrokes rather than moving under the analyst.
  for (const entry of drafted) {
    if (selected.size >= MAX_DRAFT_CALCULATED_FIELDS) break;
    if (!selected.has(entry.name)) selected.set(entry.name, entry);
  }
  return { fields: [...selected.values()], isTruncated: true };
}

/**
 * The OWN-Data-Mart field names a stored formula references. Read through `toAuthoringForm` rather
 * than a second regex over the tag syntax — that module owns the spelling and says so.
 *
 * Joined references are dropped: no entry of this draft can answer for one, and a joined name is
 * dotted, so it could otherwise collide with an own field spelled the same way.
 */
function ownFieldNamesIn(formula: string): string[] {
  return toAuthoringForm(formula, ref => ref.field)
    .refs.filter(ref => !ref.path)
    .map(ref => ref.field);
}

/** Stable empty default, so a consumer outside a provider does not re-render on identity alone. */
const NO_DRAFT_CALCULATED_FIELDS: readonly DraftCalculatedFieldDto[] = [];

/**
 * Context rather than a prop, for the reason `FormulaDataMartIdContext` gives: the path from
 * `DataMartSchemaSettings` to the formula cell runs through `SchemaContent`, the five per-storage
 * tables and `BaseSchemaTable`, none of which has any business knowing what the other rows hold,
 * and any of them could silently forget to forward one more optional prop.
 *
 * Empty outside a provider (a read-only table, a table test), which the endpoint reads as "no draft
 * to report" and answers from the persisted schema — the same behaviour as before this existed.
 */
export const DraftCalculatedFieldsContext = createContext<readonly DraftCalculatedFieldDto[]>(
  NO_DRAFT_CALCULATED_FIELDS
);

export const useDraftCalculatedFields = (): readonly DraftCalculatedFieldDto[] =>
  useContext(DraftCalculatedFieldsContext);
