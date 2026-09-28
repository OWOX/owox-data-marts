import type { SqlToken } from './sql-token-scanner';

/**
 * The set quantifier a call's argument opens with, and where the value expression begins after it.
 *
 * ONE reader for both sides of a promise: the sleeve planner decides from it which joined `COUNT`
 * stays in the outer SELECT, and the formula analyzer decides from it which one the join-grain
 * advice speaks about. Two copies agreed byte for byte until the day one of them was fixed.
 *
 * Read off the formula's token scan, so a `DISTINCT` inside a comment or a string is not one, and a
 * comment between the parenthesis and the keyword does not hide it. A bare leading word can only be
 * the quantifier: every field reference in a formula is a `{{ref}}` tag, never a bare identifier.
 */
export function readSetQuantifier(
  tokens: readonly SqlToken[],
  call: { argStart: number; argEnd: number }
): { distinct: boolean; valueStart: number } {
  const first = tokens.find(
    t => t.kind !== 'comment' && t.start >= call.argStart && t.end <= call.argEnd
  );
  const word = first?.kind === 'word' ? first.value.toUpperCase() : '';
  // `ALL` is the default and changes nothing, but a caller splicing the value out of the call must
  // still step over it.
  if (first && (word === 'DISTINCT' || word === 'ALL')) {
    return { distinct: word === 'DISTINCT', valueStart: first.end };
  }
  return { distinct: false, valueStart: call.argStart };
}
