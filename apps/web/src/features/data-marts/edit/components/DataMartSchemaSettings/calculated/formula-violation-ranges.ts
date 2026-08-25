import type { ResolvedReference } from './formula-authoring';
import { scanSql } from './sql-token-scanner';

/** A half-open span of the AUTHORING text, in the same offsets `ResolvedReference` uses. */
export interface FormulaTextRange {
  start: number;
  end: number;
}

/**
 * A violation as far as PLACING it is concerned: what it is about, and — when the backend
 * published nothing — the sentence it was said in.
 */
export interface PlaceableViolation {
  message: string;
  /** The token inside the formula this violation is about, published by the backend as data. */
  subject?: string;
}

/**
 * The wire says WHAT a violation is about (`subject`) but not WHERE: there are no offsets, and the
 * string the backend judged is not the one on screen (it carries `{{ref}}` tags). So the range is
 * re-derived here, from the subject and the text the analyst is looking at.
 *
 * `subject` is absent by design when the violation is about the formula as a whole. The prose
 * fallback below is a fallback, never the source: reading a token out of an English sentence
 * couples marker placement to wording.
 *
 * Every rule below prefers reporting NO range to guessing one — a squiggle under the wrong token is
 * worse than none, and the message renders beneath the editor either way.
 */
// Deliberately NOT anchored to the start: the fallback's one reachable case is
// FORMULA_STATEMENT_SEPARATOR_NOT_ALLOWED, whose backticked `;` sits mid-sentence.
const SUBJECT_PATTERN = /`([^`]+)`/;

/** Identifier characters plus `.`, so `SUM` never matches inside `SUMX` nor `clicks` inside
 * `orders.clicks`. */
const BOUNDARY = /[A-Za-z0-9_$.]/;

// A NUL: no formula can contain one and no subject can be one, so a masked span can never take
// part in a match. Written as an ESCAPE — a literal control character in the source makes git
// treat the whole file as binary (invisible in a diff) and hides it from plain grep.
const MASKED = '\0';

/**
 * The token a violation is about as read out of its message — the fallback for a violation the
 * backend published no `subject` for. Null when the message names none.
 */
export function violationSubject(message: string): string | null {
  const subject = SUBJECT_PATTERN.exec(message)?.[1].trim();
  if (!subject) return null;
  return subject;
}

/**
 * Blanks out string literals, comments and quoted identifiers, keeping every other offset where it
 * was. `SUM` inside `-- ignore SUM for now` is not the SUM the backend is complaining about, and
 * the ported backend lexer is what already knows where those spans are.
 */
function maskNonCode(text: string): string {
  let masked = '';
  let cursor = 0;
  for (const token of scanSql(text)) {
    if (token.kind !== 'string' && token.kind !== 'comment' && token.kind !== 'quotedIdentifier') {
      continue;
    }
    masked += text.slice(cursor, token.start) + MASKED.repeat(token.end - token.start);
    cursor = token.end;
  }
  return masked + text.slice(cursor);
}

function isStandalone(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return !BOUNDARY.test(before) && !BOUNDARY.test(after);
}

/**
 * Where in the authoring text a violation belongs — empty when it cannot be placed, which is a
 * normal outcome, not a failure.
 *
 * A resolved reference wins over a text search: the editor knows that span exactly, and a
 * reference's authoring text is spelled exactly as the backend labels it (`path.field`, see
 * `refDisplayName` and the backend's own `refLabel`). Every matching reference is marked — the same
 * name twice is the same field twice, and the violation is about both.
 *
 * Anything else — a function name, a stray `;` — is looked for as a standalone token in CODE, never
 * inside a string or a comment, and is marked ONLY when the formula contains exactly one of it.
 * `SUM(a) / SUM(SUM(b))` names `SUM` three times and the response says which of them nests inside
 * another; two of those three squiggles would be on innocent code.
 */
export function violationRanges(
  violation: PlaceableViolation,
  text: string,
  refs: readonly ResolvedReference[]
): FormulaTextRange[] {
  const subject = violation.subject?.trim() ?? violationSubject(violation.message);
  if (!subject) return [];

  // A reference whose span no longer holds its own text is stale — the analyst edited around it
  // between the request and the response — and pointing at it would mark unrelated characters.
  const referenced = refs
    .filter(ref => ref.text === subject && text.slice(ref.start, ref.end) === subject)
    .map(ref => ({ start: ref.start, end: ref.end }));
  if (referenced.length > 0) return referenced;

  const code = maskNonCode(text);
  const found: FormulaTextRange[] = [];
  for (let at = code.indexOf(subject); at !== -1; at = code.indexOf(subject, at + 1)) {
    const end = at + subject.length;
    if (isStandalone(code, at, end)) found.push({ start: at, end });
  }
  return found.length === 1 ? found : [];
}

/** An offset in the text → Monaco's 1-based line and column. */
export function toLineColumn(text: string, offset: number): { lineNumber: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, clamped);
  const lastBreak = before.lastIndexOf('\n');
  return { lineNumber: before.split('\n').length, column: clamped - lastBreak };
}
