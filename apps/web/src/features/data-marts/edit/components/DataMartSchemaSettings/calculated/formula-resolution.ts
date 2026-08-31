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
 * list, and NOT because a reference works inside one — the backend refuses that, since `"…"` is a
 * string on two of the five warehouses. It is excluded because the alternative is worse: leaving
 * `MAX("clicks")` unresolved stores it verbatim, and BigQuery then computes the maximum of the
 * text `clicks` and publishes it as a number, with nothing anywhere to say so. Resolving it turns
 * that silent wrong answer into FORMULA_TAG_IN_STRING_LITERAL at save time.
 * Routing through the real lexer (rather than a delimiter-matching regex) is
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
 * Re-derives every resolved reference straight from `text`, ignoring what the caller last knew —
 * the only way to guarantee that editing a reference into something unrecognizable drops it rather
 * than leaving a tag on a field the analyst is no longer looking at.
 *
 * Longest name first, whole-word only, and a match is discarded inside a string or comment, before
 * a `(` (function call), or when the name is 'ambiguous' — two fields legitimately sharing a dotted
 * name are skipped rather than guessed.
 *
 * `previousRefs` is the one exception: a reference whose span this edit did not touch but whose
 * name vanished from `index` (the field went DISCONNECTED) is carried forward. Dropping it would
 * turn a save-time error the backend can name into a bare word it cannot flag, deferring the
 * failure to warehouse run time. A name that CHANGED under the edit still drops.
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
