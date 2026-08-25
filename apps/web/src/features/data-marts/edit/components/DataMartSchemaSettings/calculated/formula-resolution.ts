/**
 * Re-derives the resolved references for a formula's authoring text by scanning it against the
 * referenceable-field index, rather than trusting whatever references the caller last knew about.
 *
 * Pulled out of `FormulaEditor.tsx` so the resolution logic — the part with behaviour worth
 * testing — can be unit-tested directly, and so the component file exports only the component
 * (Vite Fast Refresh only reloads cleanly when a component file exports nothing else).
 */

import {
  buildNameIndex,
  resolveTypedName,
  type ReferenceableField,
} from './formula-reference-index';
import type { ResolvedReference } from './formula-authoring';
import { scanSql } from './sql-token-scanner';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Half-open [start, end) spans of every string literal and comment in `text`, via the same
 * lexer the backend validates with (`sql-token-scanner.ts`). A quoted IDENTIFIER (`"…"` on
 * Athena/Snowflake/Redshift/Databricks, `` `…` `` on BigQuery) is deliberately excluded from this
 * list — it names a real column, so a field inside one must still resolve, not be treated as
 * quoted-away text. Routing through the real lexer (rather than a delimiter-matching regex) is
 * also what keeps an apostrophe inside a `--` comment (`don't`) from ever being misread as the
 * opening quote of a string literal later on the same line.
 */
function excludedSpans(text: string): (readonly [number, number])[] {
  return scanSql(text)
    .filter(token => token.kind === 'string' || token.kind === 'comment')
    .map(token => [token.start, token.end] as const);
}

function isWithinAnySpan(
  start: number,
  end: number,
  spans: readonly (readonly [number, number])[]
): boolean {
  return spans.some(([spanStart, spanEnd]) => start >= spanStart && end <= spanEnd);
}

/**
 * True when the first non-whitespace character after `end` is `(`. No dialect we support ever
 * follows a column reference with an open paren — only a function call does — so this is a safe,
 * blanket way to stop a field name from resolving against its own function call: `sum(sum)`,
 * `SUM(sum)`, `COUNT(count)`, or a field named the same as a nested call such as
 * `SUM(abs(clicks))` when `abs` also happens to be a column. Case-sensitivity alone does not
 * cover this, since SQL keywords are case-insensitive and a lowercase field can share a lowercase
 * function spelling.
 */
function isFollowedByOpenParen(text: string, end: number): boolean {
  let i = end;
  while (i < text.length && /\s/.test(text[i])) i++;
  return text[i] === '(';
}

/**
 * Re-derives every resolved reference straight from `text`, ignoring whatever the caller last
 * knew — the only way to guarantee that editing a reference into something unrecognizable drops
 * it instead of leaving a tag pointing at a field the analyst is no longer looking at.
 *
 * Matches are tried longest-name-first and claim their span, so `payload.value` wins over a bare
 * `payload`; whole-word boundaries stop `rev` from eating into `revenue`; a match inside a string
 * literal or a comment is discarded; a match immediately followed by `(` is discarded as a
 * function call rather than a column reference; and a name that resolves 'ambiguous' (two fields
 * legitimately sharing a dotted name) is skipped entirely rather than guessing one of the
 * candidates.
 *
 * `previousRefs` is the one exception to "always re-derived, never trusted": a reference whose
 * exact span is untouched by this edit, but whose name no longer appears in `index` at all (the
 * field went DISCONNECTED between renders), is carried forward rather than dropped. Dropping it
 * would turn a save-time error the backend can name ("field X is missing") into a bare word the
 * backend's analyzer has no way to flag, deferring the failure to warehouse run time. This does
 * not apply to a name that changed under the edit — that is still the drop-on-edit rule above —
 * nor to a name that merely became ambiguous, which is a different, new problem rather than the
 * same field going missing.
 */
export function resolveAll(
  text: string,
  index: readonly ReferenceableField[],
  previousRefs: readonly ResolvedReference[] = []
): ResolvedReference[] {
  const refs: ResolvedReference[] = [];
  const claimed: boolean[] = new Array<boolean>(text.length).fill(false);
  const excluded = excludedSpans(text);

  const byName = buildNameIndex(index);
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);

  for (const name of names) {
    // A name whose literal text is absent cannot match the pattern below, which requires exactly
    // that text — so this skips building and running a regex for every field of every joined
    // source on every keystroke, and only the handful of names actually typed reach the matcher.
    if (!text.includes(name)) continue;

    const resolved = resolveTypedName(byName, name);
    if (resolved === 'unknown' || resolved === 'ambiguous') continue;

    const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(name)}(?![\\w.])`, 'g');
    for (const m of text.matchAll(pattern)) {
      const start = m.index;
      const end = start + name.length;
      if (claimed.slice(start, end).some(Boolean)) continue;
      if (isWithinAnySpan(start, end, excluded)) continue;
      if (isFollowedByOpenParen(text, end)) continue;
      for (let i = start; i < end; i++) claimed[i] = true;
      refs.push({ text: name, start, end, path: resolved.path, field: resolved.field });
    }
  }

  for (const prev of previousRefs) {
    if (prev.end > text.length) continue;
    if (text.slice(prev.start, prev.end) !== prev.text) continue;
    if (claimed.slice(prev.start, prev.end).some(Boolean)) continue;
    if (resolveTypedName(byName, prev.text) !== 'unknown') continue;
    for (let i = prev.start; i < prev.end; i++) claimed[i] = true;
    refs.push({ ...prev });
  }

  return refs.sort((a, b) => a.start - b.start);
}
