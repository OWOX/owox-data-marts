import {
  FormulaReferenceSyntaxError,
  parseFormulaReferences,
  type FormulaReference,
} from './formula-reference';
import { scanSql, type SqlToken } from './sql-token-scanner';
import { isLiveReference } from './formula-live-reference';
import { findFunctionCalls } from './sql-function-calls';
import type { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';

export type LiftFailureReason =
  | 'contains-aggregate'
  | 'unaggregatable-reference'
  | 'no-references'
  | 'unparseable-formula'
  | 'non-distributive-formula'
  | 'truncating-integer-division';

export type FormulaLiftResult = { formula: string } | { formula: null; reason: LiftFailureReason };

/** What the lift needs about one referenced field. `undefined` from the caller refuses the lift. */
export interface LiftableReference {
  /** Whole-number type on a storage that divides without promoting. The caller owns both facts. */
  truncatesUnderDivision: boolean;
}

/**
 * Rewrites a row-level formula so it survives a GROUP BY: `{{clicks}}/{{impressions}}` becomes
 * `SUM({{clicks}})/SUM({{impressions}})`.
 *
 * The rewrite is only valid for some shapes and {@link classifyLiftableShape} whitelists them —
 * `SUM` distributes over `+`, `-` and multiplication by a constant, and over nothing else. Every
 * refusal returns `formula: null`; the caller then leaves the report uncollapsed.
 *
 * Every reference is wrapped in SUM, never in the field's own aggregation: the rewrite recomputes
 * the formula from group totals, and only a sum is a group total.
 *
 * Total — an unparseable formula is a refusal like any other. `isAggregateFunction` is a parameter
 * because aggregate-ness is dialect-specific and this module has no storage to resolve one from.
 * Splices right-to-left so each rewrite leaves earlier offsets valid.
 */
export function liftFormulaToGroupLevel(
  stored: string,
  resolveReference: (refPath: string, refField: string) => LiftableReference | undefined,
  isAggregateFunction: (name: string) => boolean
): FormulaLiftResult {
  const tokens = scanSql(stored);

  if (findFunctionCalls(tokens).some(call => isAggregateFunction(call.name))) {
    return { formula: null, reason: 'contains-aggregate' };
  }

  let refs: FormulaReference[];
  try {
    // A commented-out or quoted reference is not SQL the warehouse evaluates, so wrapping it would
    // rewrite dead text — and, inside a comment, would move the closing paren past the line end.
    refs = parseFormulaReferences(stored).filter(ref => isLiveReference(tokens, ref));
  } catch (error) {
    if (error instanceof FormulaReferenceSyntaxError) {
      return { formula: null, reason: 'unparseable-formula' };
    }
    throw error;
  }
  if (refs.length === 0) return { formula: null, reason: 'no-references' };

  // Up front, because the shape rules need the truncation fact before the splice loop runs.
  const resolved = refs.map(ref => resolveReference(ref.path, ref.field));

  const refusal = classifyLiftableShape(
    tokens,
    refs,
    index => resolved[index]?.truncatesUnderDivision === true
  );
  if (refusal) return { formula: null, reason: refusal };
  if (resolved.includes(undefined)) {
    return { formula: null, reason: 'unaggregatable-reference' };
  }

  let formula = stored;
  for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
    formula = `${formula.slice(0, ref.start)}${LIFT_AGGREGATION}(${formula.slice(ref.start, ref.end)})${formula.slice(ref.end)}`;
  }
  return { formula };
}

/** Exported so the caller gates on the same function this emits, rather than on a copy of it. */
export const LIFT_AGGREGATION: ReportAggregateFunction = 'SUM';

/** The ONLY punctuation a liftable formula may be built from. Everything else refuses the lift. */
const LIFTABLE_PUNCTUATION: ReadonlySet<string> = new Set(['+', '-', '*', '/', '(', ')', ',']);

/** Where a node sits in the formula — the only structural fact the rules below need. */
type LiftPosition =
  /** The whole formula. The one place a division may hold references on both sides. */
  | 'ratio-root'
  /** The divisor of that one top-level division, whether it is spelled `/` or `SAFE_DIVIDE`. */
  | 'denominator'
  /** Anywhere else. */
  | 'inner';

/** Why a shape cannot be lifted. Both are the caller's `reason`, never merged into one. */
type ShapeRefusal = 'non-distributive-formula' | 'truncating-integer-division';

/**
 * Scalar functions the lift may rewrite through, as data so the next one costs a row rather than a
 * parser branch. `NULLIF` is here because `FORMULA_UNGUARDED_DIVISION` tells analysts to write it.
 * Each is pinned to one position; the same name elsewhere stays refused.
 */
interface LiftableFunctionRule {
  /** Exact argument count — a different arity is a different function. */
  arity: number;
  /** Argument indexes that may hold a live reference. Every other argument must hold none. */
  referenceArguments: readonly number[];
  /** The positions the call itself may appear in. */
  placements: readonly LiftPosition[];
  /** The argument that IS this call's divisor, when the call is a division. */
  denominatorArgument?: number;
}

const LIFTABLE_FUNCTIONS: Readonly<Record<string, LiftableFunctionRule>> = {
  NULLIF: { arity: 2, referenceArguments: [0], placements: ['denominator'] },
  SAFE_DIVIDE: {
    arity: 2,
    referenceArguments: [0, 1],
    placements: ['ratio-root'],
    denominatorArgument: 1,
  },
};

/** A live reference, a numeric literal, a whitelisted call, or one arithmetic mark. */
type LiftAtom =
  | { kind: 'ref'; index: number }
  | { kind: 'number' }
  | { kind: 'call'; name: string }
  | { kind: 'operator'; value: string };

type LiftExpression =
  | { kind: 'ref'; index: number }
  | { kind: 'number' }
  | { kind: 'unary'; operand: LiftExpression }
  | { kind: 'binary'; op: string; left: LiftExpression; right: LiftExpression }
  | { kind: 'call'; name: string; args: LiftExpression[] };

interface AtomCursor {
  readonly atoms: readonly LiftAtom[];
  at: number;
}

const ADDITIVE = ['+', '-'];
const MULTIPLICATIVE = ['*', '/'];

/**
 * Whether the rewrite is arithmetically valid, and whether the formula is a ratio. Every shape not
 * listed is refused.
 *
 * Accepted: a linear combination of reference-terms, optionally divided by another such
 * combination, where a reference-term is a reference optionally scaled by numeric literals. So
 * `a/b`, `a-b`, `a*1.2`, `(a+b)/c`, `a*100/b` and `a/NULLIF(b, 0)` lift; `a*b`, `a*(1-b)`, `a+5`,
 * `1/a`, `a/(1/b)` and `a/b*c` do not.
 *
 * Four rules on the parsed tree hold that definition:
 * - `+`/`-`: both operands hold a reference, or neither — `Σ(a+5) = Σa + 5n`.
 * - `*`: at most one operand holds a reference — `Σ(q·p) ≠ Σq·Σp`.
 * - `/`: the right operand holds no reference, except at the ratio root where it may if the left
 *   does too. A reference in a divisor is degree -1, which no aggregation distributes over.
 * - any `/` whose dividend truncates is refused: the displayed per-row values are already rounded.
 *
 * So every accepted non-ratio is homogeneous of degree 1 and every accepted ratio of degree 0.
 */
function classifyLiftableShape(
  tokens: readonly SqlToken[],
  refs: readonly FormulaReference[],
  truncatesUnderDivision: (index: number) => boolean
): ShapeRefusal | undefined {
  const atoms = toLiftAtoms(tokens, refs);
  if (!atoms) return 'non-distributive-formula';

  const cursor: AtomCursor = { atoms, at: 0 };
  const expression = parseAdditive(cursor);
  // A trailing atom means the text is not one arithmetic expression — unbalanced parentheses, a
  // dangling operator, two adjacent references. Unclassifiable, therefore refused.
  if (!expression || cursor.at !== atoms.length) return 'non-distributive-formula';

  return shapeRefusalOf(expression, 'ratio-root', truncatesUnderDivision);
}

/**
 * The formula reduced to atoms; anything outside the accepted alphabet returns `null`. A word is
 * read only when {@link LIFTABLE_FUNCTIONS} names it and a `(` follows — which is what refuses
 * `CASE`, `AND`, bare column names and every other call in one stroke.
 */
function toLiftAtoms(
  tokens: readonly SqlToken[],
  refs: readonly FormulaReference[]
): LiftAtom[] | null {
  // Comments dropped up front so "the next token" below is the next token of CODE, the way
  // `findFunctionCalls` reads it — a comment between a function name and its `(` is not a gap.
  const code = tokens.filter(token => token.kind !== 'comment');
  const atoms: LiftAtom[] = [];
  let cursor = 0;
  let emitted = -1;

  for (const [index, token] of code.entries()) {
    while (cursor < refs.length && refs[cursor].end <= token.start) cursor++;

    const ref = cursor < refs.length ? refs[cursor] : undefined;
    if (ref && token.start >= ref.start && token.end <= ref.end) {
      if (emitted !== cursor) {
        atoms.push({ kind: 'ref', index: cursor });
        emitted = cursor;
      }
      continue;
    }

    if (token.kind === 'number') {
      atoms.push({ kind: 'number' });
      continue;
    }
    if (token.kind === 'punct' && LIFTABLE_PUNCTUATION.has(token.value)) {
      atoms.push({ kind: 'operator', value: token.value });
      continue;
    }
    if (token.kind === 'word') {
      const name = token.value.toUpperCase();
      const next = code[index + 1];
      const opensCall = next?.kind === 'punct' && next.value === '(';
      if (!opensCall || !Object.hasOwn(LIFTABLE_FUNCTIONS, name)) return null;
      atoms.push({ kind: 'call', name });
      continue;
    }
    return null;
  }
  return atoms;
}

function operatorAt(cursor: AtomCursor, values: readonly string[]): string | undefined {
  const atom = cursor.atoms[cursor.at];
  return atom?.kind === 'operator' && values.includes(atom.value) ? atom.value : undefined;
}

function consumeOperator(cursor: AtomCursor, value: string): boolean {
  if (!operatorAt(cursor, [value])) return false;
  cursor.at++;
  return true;
}

function parseAdditive(cursor: AtomCursor): LiftExpression | null {
  let left = parseMultiplicative(cursor);
  if (!left) return null;
  for (let op = operatorAt(cursor, ADDITIVE); op; op = operatorAt(cursor, ADDITIVE)) {
    cursor.at++;
    const right = parseMultiplicative(cursor);
    if (!right) return null;
    left = { kind: 'binary', op, left, right };
  }
  return left;
}

function parseMultiplicative(cursor: AtomCursor): LiftExpression | null {
  let left = parseUnary(cursor);
  if (!left) return null;
  for (let op = operatorAt(cursor, MULTIPLICATIVE); op; op = operatorAt(cursor, MULTIPLICATIVE)) {
    cursor.at++;
    const right = parseUnary(cursor);
    if (!right) return null;
    left = { kind: 'binary', op, left, right };
  }
  return left;
}

function parseUnary(cursor: AtomCursor): LiftExpression | null {
  if (operatorAt(cursor, ADDITIVE)) {
    cursor.at++;
    const operand = parseUnary(cursor);
    return operand && { kind: 'unary', operand };
  }
  return parsePrimary(cursor);
}

function parsePrimary(cursor: AtomCursor): LiftExpression | null {
  const atom = cursor.atoms[cursor.at];
  if (!atom) return null;
  if (atom.kind === 'ref') {
    cursor.at++;
    return { kind: 'ref', index: atom.index };
  }
  if (atom.kind === 'number') {
    cursor.at++;
    return { kind: 'number' };
  }
  if (atom.kind === 'call') {
    cursor.at++;
    return parseCallArguments(cursor, atom.name);
  }
  if (atom.value !== '(') return null;
  cursor.at++;
  // Parentheses leave NO node: they only bind, and the rules below read operands, not depth.
  const inner = parseAdditive(cursor);
  if (!inner) return null;
  if (!consumeOperator(cursor, ')')) return null;
  return inner;
}

/** `( arg { , arg } )`. Arity is not checked here — {@link LIFTABLE_FUNCTIONS} owns that. */
function parseCallArguments(cursor: AtomCursor, name: string): LiftExpression | null {
  if (!consumeOperator(cursor, '(')) return null;
  const args: LiftExpression[] = [];
  do {
    const argument = parseAdditive(cursor);
    if (!argument) return null;
    args.push(argument);
  } while (consumeOperator(cursor, ','));
  if (!consumeOperator(cursor, ')')) return null;
  return { kind: 'call', name, args };
}

function hasReference(expression: LiftExpression): boolean {
  switch (expression.kind) {
    case 'ref':
      return true;
    case 'number':
      return false;
    case 'unary':
      return hasReference(expression.operand);
    case 'call':
      return expression.args.some(hasReference);
    default:
      return hasReference(expression.left) || hasReference(expression.right);
  }
}

function hasTruncatingReference(
  expression: LiftExpression,
  truncates: (index: number) => boolean
): boolean {
  switch (expression.kind) {
    case 'ref':
      return truncates(expression.index);
    case 'number':
      return false;
    case 'unary':
      return hasTruncatingReference(expression.operand, truncates);
    case 'call':
      return expression.args.some(argument => hasTruncatingReference(argument, truncates));
    default:
      return (
        hasTruncatingReference(expression.left, truncates) ||
        hasTruncatingReference(expression.right, truncates)
      );
  }
}

/**
 * The rules governing a division, however it is spelled. Booleans rather than nodes so the `/`
 * operator and a `denominatorArgument` entry cannot be answered differently. The truncation rule
 * applies to every division including the ratio root, where per-row values are already rounded.
 */
function divisionRefusal(
  dividendHasReference: boolean,
  dividendTruncates: boolean,
  divisorHasReference: boolean,
  atRatioRoot: boolean
): ShapeRefusal | undefined {
  if (divisorHasReference && !(atRatioRoot && dividendHasReference)) {
    return 'non-distributive-formula';
  }
  return dividendTruncates ? 'truncating-integer-division' : undefined;
}

/** The rules of {@link classifyLiftableShape}, applied to every node of the tree. */
function shapeRefusalOf(
  expression: LiftExpression,
  position: LiftPosition,
  truncates: (index: number) => boolean
): ShapeRefusal | undefined {
  switch (expression.kind) {
    case 'ref':
    case 'number':
      return undefined;
    case 'unary':
      return shapeRefusalOf(expression.operand, 'inner', truncates);
    case 'call':
      return callRefusalOf(expression, position, truncates);
    default:
      break;
  }

  const { op, left, right } = expression;
  const leftHasReference = hasReference(left);
  const rightHasReference = hasReference(right);
  let rightPosition: LiftPosition = 'inner';

  if (ADDITIVE.includes(op)) {
    if (leftHasReference !== rightHasReference) return 'non-distributive-formula';
  } else if (op === '*') {
    if (leftHasReference && rightHasReference) return 'non-distributive-formula';
  } else {
    const refusal = divisionRefusal(
      leftHasReference,
      hasTruncatingReference(left, truncates),
      rightHasReference,
      position === 'ratio-root'
    );
    if (refusal) return refusal;
    // Granted only to a divisor that actually holds a reference, which — the rule above having
    // passed — can only be the divisor of THE ratio.
    if (rightHasReference) rightPosition = 'denominator';
  }

  return (
    shapeRefusalOf(left, 'inner', truncates) ?? shapeRefusalOf(right, rightPosition, truncates)
  );
}

/** One whitelisted call, checked against its {@link LIFTABLE_FUNCTIONS} row and nothing else. */
function callRefusalOf(
  call: Extract<LiftExpression, { kind: 'call' }>,
  position: LiftPosition,
  truncates: (index: number) => boolean
): ShapeRefusal | undefined {
  const rule = LIFTABLE_FUNCTIONS[call.name];
  if (!rule) return 'non-distributive-formula';
  if (call.args.length !== rule.arity) return 'non-distributive-formula';
  if (!rule.placements.includes(position)) return 'non-distributive-formula';

  const divisorIndex = rule.denominatorArgument;
  if (divisorIndex !== undefined) {
    const dividends = call.args.filter((_, index) => index !== divisorIndex);
    const refusal = divisionRefusal(
      dividends.some(hasReference),
      dividends.some(argument => hasTruncatingReference(argument, truncates)),
      hasReference(call.args[divisorIndex]),
      position === 'ratio-root'
    );
    if (refusal) return refusal;
  }

  for (const [index, argument] of call.args.entries()) {
    if (!rule.referenceArguments.includes(index) && hasReference(argument)) {
      return 'non-distributive-formula';
    }
    const argumentPosition: LiftPosition =
      index === divisorIndex && hasReference(argument) ? 'denominator' : 'inner';
    const refusal = shapeRefusalOf(argument, argumentPosition, truncates);
    if (refusal) return refusal;
  }
  return undefined;
}
