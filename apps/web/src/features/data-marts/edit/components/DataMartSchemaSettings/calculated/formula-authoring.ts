/**
 * Conversion between the authoring form of a calculated-field formula (plain warehouse SQL, as
 * the analyst types and reads it) and the stored form (the same formula with each field reference
 * normalised into a `{{ref path="…" field="…"}}` tag).
 *
 * Mirrors the backend's tag reader/writer in
 * apps/backend/src/data-marts/calculated-fields/formula-reference.ts — the tag spelling here must
 * match exactly, or a formula that saves will never render.
 */

export interface ResolvedReference {
  /** The text as the analyst typed it — what the editor shows. */
  text: string;
  start: number;
  end: number;
  /** aliasPath relative to the metric's own Data Mart; '' means that Data Mart. */
  path: string;
  field: string;
}

const TAG = 'ref';

/**
 * Authoring text plus the references the editor resolved while it was typed → the stored form.
 *
 * Spans are applied RIGHT TO LEFT: every substitution changes the string's length, so replacing
 * left to right invalidates every offset after the first one.
 */
export function toStoredForm(authoring: string, refs: readonly ResolvedReference[]): string {
  const ordered = [...refs].sort((a, b) => b.start - a.start);
  let out = authoring;
  for (const ref of ordered) {
    if (ref.path.includes('"') || ref.field.includes('"')) {
      // The backend rejects this too; failing here keeps a malformed tag from ever being sent.
      throw new Error(`A field reference cannot contain a double quote: ${ref.path}.${ref.field}`);
    }
    const path = ref.path ? ` path="${ref.path}"` : '';
    out = out.slice(0, ref.start) + `{{${TAG}${path} field="${ref.field}"}}` + out.slice(ref.end);
  }
  return out;
}

// STRICT and deliberately so: the backend canonicalizes every formula before it is persisted
// (`CalculatedFieldValidatorService` re-serializes each reference through
// `serializeFormulaReference` the moment its parser pass accepts a save — see
// apps/backend/src/data-marts/calculated-fields/calculated-field-validator.service.ts). So the
// only shape this reader will ever be handed is the canonical one this pattern matches: `ref`
// first, `path` before `field` when present, one space, no unknown keys, no odd whitespace.
//
// This used to be a looser, order/whitespace/unknown-key-tolerant pattern trying to match the
// backend's Handlebars-AST parser attribute-for-attribute. Three review rounds, three
// regressions, each fix breaking a case the version before it handled (a brace inside a quoted
// value, a tag with no `field`, whitespace around `=`) — chasing parity with a real parser using a
// regex doesn't end. The fix was moving the invariant to where it can actually be enforced: the
// backend now guarantees canonical spelling on write, so the browser reader can go back to being
// exactly this simple. If a new non-canonical shape ever needs to be READ, canonicalize harder on
// the backend — do not loosen this pattern again.
const TAG_PATTERN = /\{\{\s*ref(?:\s+path="([^"]*)")?\s+field="([^"]*)"\s*\}\}/g;

/** The stored form → what the analyst sees, plus the spans the editor needs to keep resolving. */
export function toAuthoringForm(
  stored: string,
  nameOf: (ref: { path: string; field: string }) => string
): { text: string; refs: ResolvedReference[] } {
  const refs: ResolvedReference[] = [];
  let text = '';
  let cursor = 0;
  for (const match of stored.matchAll(TAG_PATTERN)) {
    const [tag, path = '', field] = match;
    const name = nameOf({ path, field });
    text += stored.slice(cursor, match.index);
    refs.push({ text: name, start: text.length, end: text.length + name.length, path, field });
    text += name;
    cursor = match.index + tag.length;
  }
  return { text: text + stored.slice(cursor), refs };
}
