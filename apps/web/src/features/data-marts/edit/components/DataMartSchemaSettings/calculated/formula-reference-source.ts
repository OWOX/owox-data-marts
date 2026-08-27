/**
 * What a chip cannot say for itself: which Data Mart a joined reference reads from, and whether an
 * own-Data-Mart one is another formula rather than a column.
 *
 * `orders.amount` spells a JOIN ALIAS, and an alias is not what anyone knows the Data Mart by: at
 * the demo `SUM(orders.amount)` drew "what is `orders`?". `revenue` has the same problem in the
 * other direction — it reads exactly like a column and is not written like one. Autocomplete
 * answers both while the name is being typed (monaco-formula-completion.util.ts); this is the same
 * answer for a reference already in the formula.
 */

import type { CalculatedFieldLevel } from '../../../../shared/types/data-mart-schema.types';
import type { ReferenceableField } from './formula-reference-index';

/**
 * Alias path → the joined Data Mart's display name.
 *
 * Keyed by PATH, not by the field's full name: every field of one joined source shares its label,
 * and a reference the index can no longer resolve field-for-field (a column dropped from that Data
 * Mart) still knows which source it named.
 */
export function buildSourceLabelIndex(
  index: readonly ReferenceableField[]
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const entry of index) {
    if (!entry.path || !entry.sourceLabel) continue;
    if (!labels.has(entry.path)) labels.set(entry.path, entry.sourceLabel);
  }
  return labels;
}

/**
 * Field name → what is known about it, for the CALCULATED fields of the Data Mart being edited.
 * The value carries the level when a save has derived one, and is empty when none has.
 *
 * Keyed by name rather than by path, unlike the labels above: every own field shares the empty
 * path, so the name is the only thing telling one from the next. That is also why joined entries
 * are skipped rather than merely ignored later — a joined name is DOTTED, so `orders.amount` from
 * a joined source would answer for an own struct field spelled the same way. No producer emits a
 * joined entry carrying `calculated` today (`buildJoinedReferenceIndex` skips them outright);
 * this is what keeps that from becoming a wrong answer if one ever does.
 */
export function buildCalculatedFieldIndex(
  index: readonly ReferenceableField[]
): ReadonlyMap<string, { level?: CalculatedFieldLevel }> {
  const calculatedFields = new Map<string, { level?: CalculatedFieldLevel }>();
  for (const entry of index) {
    if (entry.path || !entry.calculated) continue;
    if (!calculatedFields.has(entry.name)) calculatedFields.set(entry.name, entry.calculated);
  }
  return calculatedFields;
}

/**
 * What a chip says on hover, or undefined when it has nothing to add.
 *
 * Nothing for an ordinary OWN-Data-Mart reference: it reads a column of the Data Mart being edited,
 * which is the page the analyst is on. Nothing either for a joined path with no label — the
 * fallback would be the alias, which is the very text already on screen.
 *
 * A calculated own reference does have something to add, and it is the level: the two levels are
 * written differently, and the sentences here are the backend's own, so the refusal an analyst may
 * meet next says the same thing this did.
 *
 * Except when no save has derived that level yet, and then the honest answer is to say so. These
 * are SENTENCES, and two of the three rule something out — "cannot be wrapped". The completion
 * row's label may take the quiet guess an absent level gets everywhere else in the web, because
 * the worst a label does is under-sell one row of a menu; a sentence carrying "cannot" would tell
 * the analyst that `SUM(roas)` is illegal when it may be exactly what they need.
 */
export function describeReferenceSource(
  ref: { path: string; field: string },
  labels: ReadonlyMap<string, string>,
  calculatedFields: ReadonlyMap<string, { level?: CalculatedFieldLevel }>
): string | undefined {
  if (!ref.path) {
    const calculated = calculatedFields.get(ref.field);
    if (!calculated) return undefined;
    if (!calculated.level) {
      return `${ref.field} is a calculated field. Whether it aggregates is known once the schema is saved.`;
    }
    return calculated.level === 'metric'
      ? `${ref.field} is a calculated field that already aggregates, so it cannot be wrapped in ` +
          `another aggregation.`
      : `${ref.field} is a row-level calculated field, so it behaves like any other column.`;
  }
  const label = labels.get(ref.path);
  if (!label) return undefined;
  // Typographic quotes, not straight ones: a Data Mart's title is free-form user text and
  // `My "Best" Mart` would otherwise nest one pair of quotes inside an identical pair.
  return `${ref.field} from the joined Data Mart \u201C${label}\u201D`;
}
