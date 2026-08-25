/**
 * A resolved field reference, drawn as a pill.
 *
 * Decorations ONLY: the Monaco model stays the plain text the analyst typed, exactly as
 * `toStoredForm` expects to find it. A chip carries no identity either — this is re-derived from
 * `value` and `references` on every render, so a reference that stops resolving (an alias renamed,
 * a character typed into the name) simply stops being drawn, with nothing to clean up.
 *
 * What makes the pill ATOMIC is `formula-chip-interaction.ts`; this module only says where one is.
 */

import type * as monaco from 'monaco-editor';
import type { ResolvedReference } from './formula-authoring';
import { toLineColumn } from './formula-violation-ranges';

/** Goes on the span Monaco wraps the reference's characters in; styled in `styles/App.css`. */
export const CHIP_CLASS_NAME = 'formula-field-chip';

// monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges. Spelled as its number because
// monaco is loaded from a CDN at run time and is not a bundled dependency — nothing in the app may
// import a runtime VALUE from it, only types.
const NEVER_GROWS_WHEN_TYPING_AT_EDGES = 1;

/**
 * One decoration per reference that still holds its own text in `text`.
 *
 * The re-check is not paranoia: `references` is the parent's belief about `value`, and while the
 * analyst types the two are a render apart. A span that no longer spells its reference would pill
 * whatever characters now sit there — the same guard `violationRanges` applies before marking.
 */
export function chipDecorationsFor(
  text: string,
  refs: readonly ResolvedReference[]
): monaco.editor.IModelDeltaDecoration[] {
  return refs
    .filter(ref => ref.end > ref.start && text.slice(ref.start, ref.end) === ref.text)
    .map(ref => {
      const start = toLineColumn(text, ref.start);
      const end = toLineColumn(text, ref.end);
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        options: {
          inlineClassName: CHIP_CLASS_NAME,
          stickiness: NEVER_GROWS_WHEN_TYPING_AT_EDGES,
        },
      };
    });
}
