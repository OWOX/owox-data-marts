import type { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { type FormulaReference, parseFormulaReferences } from './formula-reference';
import { readSetQuantifier } from './set-quantifier';
import { findFunctionCalls, type SqlFunctionCall } from './sql-function-calls';
import { scanSql, type SqlToken } from './sql-token-scanner';

/**
 * How the values of one formula part, computed for separate groups of rows, combine into its value
 * for all those rows. `const` is the same for every group, and `other` combines by no function.
 */
export type RollupClass = 'const' | 'nullableSum' | 'neverNullSum' | 'min' | 'max' | 'other';

export interface RollupClassifyOptions {
  /** The class of a calculated field of the formula's own Data Mart; `other` for any other name. */
  classifyOwnReference(field: string): RollupClass;
  integerDivisionTruncates: boolean;
}

const OPERATORS = ['+', '-', '*', '/', '(', ')'] as const;
type Operator = (typeof OPERATORS)[number];
type Atom = RollupClass | Operator;

// Inside a call, these words make a dialect aggregate such as `SUM(a HAVING MAX b)`.
const CLAUSE_KEYWORDS = new Set(['HAVING', 'GROUP', 'ORDER', 'LIMIT', 'WHERE']);

interface FormulaScan {
  tokens: readonly SqlToken[];
  references: readonly FormulaReference[];
  referenceAt: ReadonlyMap<number, FormulaReference>;
  callAt: ReadonlyMap<number, SqlFunctionCall>;
  options: RollupClassifyOptions;
}

/**
 * The class of a stored formula. Anything this reader does not know gives `other`, because a wrong
 * `sum` lets a client add up values that do not add up.
 */
export function classifyFormulaRollup(
  formula: string,
  options: RollupClassifyOptions
): RollupClass {
  let references: FormulaReference[];
  try {
    references = parseFormulaReferences(formula);
  } catch {
    return 'other';
  }
  const tokens = scanSql(formula);
  if (tokens.some(token => token.unterminated)) return 'other';
  const calls = findFunctionCalls(tokens).filter(call => call.closed);
  const scan: FormulaScan = {
    tokens,
    references,
    referenceAt: new Map(references.map(ref => [ref.start, ref])),
    callAt: new Map(calls.map(call => [call.nameStart, call])),
    options,
  };
  const code = tokens.filter(token => token.kind !== 'comment');
  try {
    return classifyTokens(scan, code);
  } catch (error) {
    // A response reads every formula, so nesting deeper than the stack holds must not fail it.
    if (error instanceof RangeError) return 'other';
    throw error;
  }
}

export function rollupAggregationsOfClass(rollup: RollupClass): ReportAggregateFunction[] {
  switch (rollup) {
    case 'nullableSum':
    case 'neverNullSum':
      return ['SUM'];
    case 'min':
      return ['MIN'];
    case 'max':
      return ['MAX'];
    default:
      return [];
  }
}

/** Reads `code` (no comments) as atoms and operators, then parses it. */
function classifyTokens(scan: FormulaScan, code: readonly SqlToken[]): RollupClass {
  const atoms: Atom[] = [];
  let i = 0;
  while (i < code.length) {
    const token = code[i];
    const ref = scan.referenceAt.get(token.start);
    const call = token.kind === 'word' ? scan.callAt.get(token.start) : undefined;
    if (ref) {
      atoms.push(ref.path ? 'other' : scan.options.classifyOwnReference(ref.field));
      while (i < code.length && code[i].start < ref.end) i++;
    } else if (call) {
      // `code[i + 1]` is the call's `(`, and `code[close]` is its `)`.
      let close = i + 2;
      while (close < code.length && code[close].start < call.argEnd) close++;
      atoms.push(classifyCall(scan, call, code.slice(i + 2, close)));
      i = close + 1;
    } else if (token.kind === 'number') {
      atoms.push('const');
      i++;
    } else if (token.kind === 'punct' && isOperator(token.value)) {
      atoms.push(token.value);
      i++;
    } else {
      return 'other';
    }
  }
  return parseAtoms(atoms, scan.options.integerDivisionTruncates);
}

function classifyCall(
  scan: FormulaScan,
  call: SqlFunctionCall,
  args: readonly SqlToken[]
): RollupClass {
  const readsJoined = scan.references.some(
    ref => ref.path && call.argStart <= ref.start && ref.start < call.argEnd
  );
  if (readsJoined) return 'other';
  if (args.some(t => t.kind === 'word' && CLAUSE_KEYWORDS.has(t.value.toUpperCase()))) {
    return 'other';
  }

  const commas = topLevelCommaIndexes(args);
  const name = call.name.toUpperCase();
  // `COALESCE(x, 0)` closes the NULL gap of a group where `x` has no values.
  if (name === 'COALESCE') {
    if (commas.length !== 1) return 'other';
    const fallback = args.slice(commas[0] + 1);
    const zero =
      fallback.length === 1 && fallback[0].kind === 'number' && Number(fallback[0].value) === 0;
    return zero && isSum(classifyTokens(scan, args.slice(0, commas[0]))) ? 'neverNullSum' : 'other';
  }
  // `MAX(a, 5)` returns an array on Athena and DuckDB.
  if (commas.length > 0) return 'other';
  if (name === 'SUM' || name === 'COUNT') {
    if (readSetQuantifier(scan.tokens, call).distinct) return 'other';
    // For a group with no values, `SUM` gives NULL and `COUNT` gives 0.
    return name === 'SUM' ? 'nullableSum' : 'neverNullSum';
  }
  if (name === 'MIN') return 'min';
  if (name === 'MAX') return 'max';
  return 'other';
}

function topLevelCommaIndexes(args: readonly SqlToken[]): number[] {
  const indexes: number[] = [];
  let depth = 0;
  args.forEach((token, index) => {
    if (token.kind !== 'punct') return;
    if (token.value === '(') depth++;
    else if (token.value === ')') depth--;
    else if (token.value === ',' && depth === 0) indexes.push(index);
  });
  return indexes;
}

/**
 * `expr := term (('+'|'-') term)*`, `term := unary (('*'|'/') unary)*`,
 * `unary := ('+'|'-') unary | atom | '(' expr ')'`. A malformed sequence gives `other`.
 */
function parseAtoms(atoms: readonly Atom[], integerDivisionTruncates: boolean): RollupClass {
  let at = 0;
  const unary = (): RollupClass => {
    const atom = atoms[at++];
    if (atom === '+') return unary();
    if (atom === '-') return negated(unary());
    if (atom === '(') {
      const inner = expression();
      return atoms[at++] === ')' ? inner : 'other';
    }
    return atom === undefined || isOperator(atom) ? 'other' : atom;
  };
  const term = (): RollupClass => {
    let left = unary();
    while (atoms[at] === '*' || atoms[at] === '/') {
      const operator = atoms[at++];
      const right = unary();
      left =
        operator === '*' ? multiplied(left, right) : divided(left, right, integerDivisionTruncates);
    }
    return left;
  };
  const expression = (): RollupClass => {
    let left = term();
    while (atoms[at] === '+' || atoms[at] === '-') {
      at++;
      left = added(left, term());
    }
    return left;
  };
  const result = expression();
  return at === atoms.length ? result : 'other';
}

const isOperator = (value: string): value is Operator =>
  (OPERATORS as readonly string[]).includes(value);

const isSum = (rollup: RollupClass) => rollup === 'nullableSum' || rollup === 'neverNullSum';

const isLinear = (rollup: RollupClass) => isSum(rollup) || rollup === 'const';

const negated = (x: RollupClass): RollupClass => (isLinear(x) ? x : 'other');

// A NULL term makes the group's value NULL, so the other term's value for that group is lost.
const added = (x: RollupClass, y: RollupClass): RollupClass =>
  x === y && (x === 'const' || x === 'neverNullSum') ? x : 'other';

const multiplied = (x: RollupClass, y: RollupClass): RollupClass => {
  if (x === 'const' && isLinear(y)) return y;
  if (y === 'const' && isLinear(x)) return x;
  return 'other';
};

// A truncating storage rounds each group's quotient, so the group values no longer add up.
const divided = (x: RollupClass, y: RollupClass, integerDivisionTruncates: boolean): RollupClass =>
  !integerDivisionTruncates && y === 'const' && isLinear(x) ? x : 'other';
