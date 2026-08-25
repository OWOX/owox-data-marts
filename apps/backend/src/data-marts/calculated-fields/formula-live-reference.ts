import { type FormulaReference, parseFormulaReferences } from './formula-reference';
import { scanSql, type SqlToken } from './sql-token-scanner';

/**
 * Whether a `{{ref}}` tag is real SQL to the warehouse, decided against a scanned formula's tokens.
 *
 * Two modules need this and must agree exactly: `formula-analyzer.ts` (which refuses a tag in a
 * string literal and ignores one in a comment) and `formula-owner-plan.ts` (which decides which
 * Data Mart owns each aggregate call). They held byte-identical copies of these predicates; a
 * one-sided edit would have made a formula legal to save but routed to the wrong Data Mart, so the
 * agreement lives here rather than in a convention.
 */
const containedIn =
  (kind: SqlToken['kind']) => (tokens: readonly SqlToken[], r: FormulaReference) =>
    tokens.some(t => t.kind === kind && t.start <= r.start && r.end <= t.end);

/**
 * A tag inside a string literal: text to the warehouse, a reference to Handlebars.
 *
 * A DOUBLE-quoted run counts too, and that is not a formality: `"` opens a STRING on BigQuery and
 * Databricks (measured) and a quoted identifier on the other three, while the scanner reads one
 * lexical model for all five and calls it `quotedIdentifier` everywhere. Judged live, a tag inside
 * `"…"` is resolved, substituted, and then rendered by those two warehouses as a text constant —
 * the field publishes its own name where a number belongs, silently. Counting it as a string
 * instead makes the same formula refuse at save (FORMULA_TAG_IN_STRING_LITERAL), which is the loud
 * direction and correct on all five: a reference has no meaning inside a quoted identifier either.
 */
const inStringLike = (tokens: readonly SqlToken[], r: FormulaReference): boolean =>
  containedIn('string')(tokens, r) || containedIn('quotedIdentifier')(tokens, r);

export const isReferenceInString = inStringLike;

/** A tag inside a SQL comment: dead text the warehouse never evaluates. */
export const isReferenceInComment = containedIn('comment');

export function isLiveReference(tokens: readonly SqlToken[], r: FormulaReference): boolean {
  return !isReferenceInString(tokens, r) && !isReferenceInComment(tokens, r);
}

/**
 * Every reference of a stored formula that the warehouse actually evaluates — the scan-then-filter
 * pairing above, in one place, for the callers that want the references rather than the tokens.
 * Throws `FormulaReferenceSyntaxError` for an unparseable formula, exactly as
 * `parseFormulaReferences` does; a caller that must survive one persisted before validation existed
 * catches it (see `brokenReferencesOf`).
 */
export function liveFormulaReferences(stored: string): FormulaReference[] {
  const tokens = scanSql(stored);
  return parseFormulaReferences(stored).filter(ref => isLiveReference(tokens, ref));
}

/**
 * Whether a stored formula names a joined Data Mart in SQL the warehouse actually reads — the
 * predicate that decides whether save-time validation reads the join tree and whether the save-time
 * dry run composes through the blended builder. Both must answer it the same way, or a formula
 * validates against a join tree it is then not composed against.
 *
 * An unparseable formula names nothing resolvable: its own syntax violation is what reports it, and
 * this must not be the thing that throws first (the callers run before, or instead of, that check).
 */
export function hasLiveJoinedReference(stored: string): boolean {
  try {
    return liveFormulaReferences(stored).some(ref => ref.path !== '');
  } catch {
    return false;
  }
}
