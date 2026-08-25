import { FormulaReference, parseFormulaReferences } from './formula-reference';
import { findFunctionCalls, SqlFunctionCall } from './sql-function-calls';
import { scanSql } from './sql-token-scanner';
import { isLiveReference } from './formula-live-reference';

/** Which Data Mart an aggregate call reads from. '' is the metric's own Data Mart. */
export type FormulaCallOwner = { kind: 'own' } | { kind: 'joined'; aliasPath: string };

export interface FormulaAggregateCall {
  /** The aggregate function as written, upper-cased. */
  fn: string;
  /** Offsets of the whole call in the STORED formula, `[start, end)`, parentheses included. */
  start: number;
  end: number;
  /**
   * Offsets of the call's ARGUMENT text, `[argStart, argEnd)`, parentheses EXCLUDED. Carried
   * rather than re-derived by the consumer that renders a joined call's argument into a sleeve
   * slot: locating the opening paren by searching the text finds one written inside a comment
   * between the function name and its own paren, while the producer knows both boundaries exactly.
   */
  argStart: number;
  argEnd: number;
  owner: FormulaCallOwner;
  /** Every reference inside this call's arguments, in source order. */
  refs: FormulaReference[];
}

export interface FormulaOwnerPlan {
  calls: FormulaAggregateCall[];
  /** True when at least one call is owned by a joined Data Mart. */
  hasJoinedCall: boolean;
}

/** What `buildFormulaOwnerPlan` answers: the routing plan AND what it could not route. */
export interface FormulaOwnerAnalysis {
  plan: FormulaOwnerPlan;
  violations: FormulaOwnerViolation[];
}

export type FormulaOwnerViolation =
  | { kind: 'mixed-owner-call'; fn: string; paths: string[] }
  | { kind: 'ref-outside-aggregate'; field: string };

/**
 * Decides which Data Mart every aggregate call in a formula reads from, purely from ref paths and
 * call spans — no SQL semantics, no dialect. An unclosed call contributes no owner decision: its
 * argEnd is only where the scan gave up (SqlFunctionCall.closed), so it never appears in
 * `plan.calls`, but a ref physically inside it still counts as contained (not ref-outside-aggregate)
 * so this module doesn't stack a second, contradictory violation on top of the
 * FORMULA_UNBALANCED_PARENTHESIS that already covers it upstream — the same trap
 * formula-analyzer.ts's `effectiveArgEnd` avoids.
 *
 * Violations are appended in two passes — every `ref-outside-aggregate` before any
 * `mixed-owner-call` — not in formula (source) order.
 */
export function buildFormulaOwnerPlan(
  stored: string,
  isAggregateFunction: (name: string) => boolean
): FormulaOwnerAnalysis {
  const tokens = scanSql(stored);

  // analyzeFormula never blocks a comment-only ref from being saved, so a commented-out reference
  // must not count as an owner here either.
  const liveRefs = parseFormulaReferences(stored).filter(r => isLiveReference(tokens, r));

  const allAggregateCalls = findFunctionCalls(tokens).filter(c => isAggregateFunction(c.name));
  const closedAggregateCalls = allAggregateCalls.filter(c => c.closed);
  const effectiveArgEnd = (c: SqlFunctionCall) => (c.closed ? c.argEnd : stored.length);

  const violations: FormulaOwnerViolation[] = [];
  const refsByCall = new Map<SqlFunctionCall, FormulaReference[]>(
    closedAggregateCalls.map(c => [c, []])
  );

  for (const ref of liveRefs) {
    const containing = allAggregateCalls.filter(
      c => c.argStart <= ref.start && ref.end <= effectiveArgEnd(c)
    );
    if (containing.length === 0) {
      violations.push({ kind: 'ref-outside-aggregate', field: ref.field });
      continue;
    }
    // Containing calls nest strictly, so the deepest (SqlFunctionCall.depth) one is innermost.
    const innermost = containing.reduce((a, b) => (b.depth > a.depth ? b : a));
    // Unclosed calls get no plan.calls entry — dropping the ref here is that "no owner decision".
    if (innermost.closed) refsByCall.get(innermost)!.push(ref);
  }

  const calls: FormulaAggregateCall[] = closedAggregateCalls.map(call => {
    const callRefs = refsByCall.get(call)!;
    const paths = [...new Set(callRefs.map(r => r.path))];
    const fn = call.name.toUpperCase();

    let owner: FormulaCallOwner = { kind: 'own' };
    if (paths.length === 1 && paths[0] !== '') {
      owner = { kind: 'joined', aliasPath: paths[0] };
    } else if (paths.length > 1) {
      violations.push({ kind: 'mixed-owner-call', fn, paths });
    }

    return {
      fn,
      start: call.nameStart,
      end: call.argEnd + 1,
      argStart: call.argStart,
      argEnd: call.argEnd,
      owner,
      refs: callRefs,
    };
  });

  return {
    plan: { calls, hasJoinedCall: calls.some(c => c.owner.kind === 'joined') },
    violations,
  };
}
