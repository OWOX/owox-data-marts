import {
  FormulaReference,
  parseFormulaReferences,
  FormulaReferenceSyntaxError,
} from './formula-reference';
import { scanSql, SqlToken } from './sql-token-scanner';
import { findFunctionCalls, SqlFunctionCall } from './sql-function-calls';
import { FormulaFunctionDialect } from './formula-function-dialect';
import { FormulaViolation, FormulaViolations } from './formula-violations';
import {
  isLiveReference,
  isReferenceInString,
  referenceContextTokens,
} from './formula-live-reference';
import { CalculatedFieldLevel } from './formula-level';

export interface AggregateCall {
  name: string;
  /** aliasPath of the Data Mart the call reads; '' = the metric's own Data Mart. */
  owner: string;
  references: FormulaReference[];
  /** Offset of the function name (its first letter), not of its opening parenthesis. Used to splice the outer SELECT. */
  nameStart: number;
}

export interface FormulaAnalysis {
  aggregateCalls: AggregateCall[];
  references: FormulaReference[];
  errors: FormulaViolation[];
  warnings: FormulaViolation[];
  /**
   * Reported even when `errors` is non-empty, so the caller can pick the right message — but
   * meaningful only once the references PARSED: the Handlebars-syntax early return has no call
   * list to derive from and reports 'column' for a formula that was never read. Never PERSIST a
   * level from an analysis carrying errors; gate that write on `errors.length === 0`.
   */
  level: CalculatedFieldLevel;
}

/**
 * 'aggregate' = the reference already names an aggregated measure, e.g. Unique Count.
 *
 * The two 'calculated-*' states name another Calculated Field AND carry ITS OWN level, which the
 * level rule needs and 'aggregate' cannot supply: its message says "is already an
 * aggregate", which hides from the analyst that the thing to go and fix is another formula.
 */
export type ReferenceState =
  | 'ok'
  | 'missing'
  | 'calculated-metric'
  | 'calculated-column'
  | 'aggregate';

export interface AnalyzeFormulaInput {
  fieldName: string;
  formula: string;
  dialect: FormulaFunctionDialect;
  knownField(path: string, field: string): ReferenceState;
}

const refLabel = (r: FormulaReference) => (r.path ? `${r.path}.${r.field}` : r.field);

export function analyzeFormula(input: AnalyzeFormulaInput): FormulaAnalysis {
  const { fieldName, formula, dialect } = input;
  const errors: FormulaViolation[] = [];
  const warnings: FormulaViolation[] = [];

  let references: FormulaReference[];
  try {
    references = parseFormulaReferences(formula);
  } catch (e) {
    if (e instanceof FormulaReferenceSyntaxError) {
      return {
        aggregateCalls: [],
        references: [],
        warnings: [],
        // Neither half of the level rule has anything to read: no call list was ever
        // built to find an aggregate in, and no reference was ever resolved to ask a level of.
        level: 'column',
        errors: [
          FormulaViolations.syntax(
            fieldName,
            `The formula's field references could not be read: ${e.message}`
          ),
        ],
      };
    }
    throw e;
  }

  const tokens = scanSql(formula);

  // Every liveness question below is asked per reference over this subset instead of the whole
  // token list — the same answer, over a list that is empty for a formula holding no quotes.
  const contextTokens = referenceContextTokens(tokens);

  // A tag inside a string literal is text to the warehouse but a reference to Handlebars —
  // the two readings disagree, so refuse instead of picking one.
  if (references.some(r => isReferenceInString(contextTokens, r)))
    errors.push(FormulaViolations.tagInStringLiteral(fieldName));

  // Only live references participate in containment, owner resolution, level mixing and the
  // knownField lookup — a non-live one already has its own, more specific outcome: one
  // FORMULA_TAG_IN_STRING_LITERAL for the whole formula for a string-embedded tag, and nothing at
  // all for a commented-out one, since being commented out is not itself a violation.
  //
  // Memoised per reference because the aggregate loop below asks again for every CALL, and one
  // answer costs three token scans: A x R x 3T on a formula allowed to be 10 000 characters long.
  // Measured without the map and without `contextTokens`: 2.4 s for a single max-length formula, on
  // a synchronous path that analyses up to 100 drafts per request with no `await` to yield the
  // event loop.
  const liveByRef = new Map<FormulaReference, boolean>();
  const isLive = (r: FormulaReference): boolean => {
    const known = liveByRef.get(r);
    if (known !== undefined) return known;
    const live = isLiveReference(contextTokens, r);
    liveByRef.set(r, live);
    return live;
  };

  if (hasWord(tokens, 'SELECT')) errors.push(FormulaViolations.subquery(fieldName));
  if (hasWord(tokens, 'OVER')) errors.push(FormulaViolations.window(fieldName));

  // Defence in depth: the stored formula is spliced VERBATIM into the SELECT list
  // (`renderAggregatedSelect`), so a statement separator is the one punctuation mark that could
  // end the expression and start something else. The dry run would reject most of what follows,
  // but "most" is not the guarantee to rely on for a character that means "a new statement" —
  // refuse it here, where the whole formula grammar is decided. A `;` inside a string literal or
  // a comment is a different token kind and stays legal text.
  if (tokens.some(t => t.kind === 'punct' && t.value === ';')) {
    errors.push(FormulaViolations.statementSeparator(fieldName));
  }

  // The same reasoning at the next level down. `clicks, other` is VALID SQL in a SELECT list, so
  // the dry run passes it: it projects a second column and attaches this field's output alias to
  // whichever expression ends up last, and on the grouping path it changes the report's grain.
  // Only DEPTH 0 counts — a comma between a call's arguments (`CONCAT(a, b)`,
  // `COUNT(DISTINCT x)`) is ordinary, and one inside a string literal or a comment is not a
  // `punct` token at all.
  if (hasTopLevelComma(tokens)) {
    errors.push(FormulaViolations.expressionSeparator(fieldName));
  }

  // The one place the warehouses CONTRADICT each other rather than merely differ: `#` opens a line
  // comment on BigQuery and is bitwise XOR on Redshift, `//` opens one on Snowflake and is a syntax
  // error elsewhere. Measured. One lexical model cannot be right for both, so the scanner calls
  // them `punct` and the analyzer would judge everything after the marker as LIVE code — resolving
  // references there, counting aggregate calls there towards the LEVEL — while the warehouse
  // receives valid SQL with that tail commented out and the dry run raises nothing.
  //
  // Inside a string or a comment neither is a `punct` token, so `'#tag'` stays legal text.
  for (const marker of ambiguousCommentMarkers(tokens)) {
    errors.push(FormulaViolations.dialectAmbiguousMarker(fieldName, marker));
  }

  // The same family again, and the one that made every guard above unreachable at once. Four of
  // the five warehouses treat `\\'` inside a literal as an escaped quote and Athena/Trino does not,
  // so the two readings close the literal in different places — and the reading that closes it
  // early runs the remainder as SQL while this analyzer sees one inert `string` token.
  if (
    tokens.some(
      t => (t.kind === 'string' || t.kind === 'quotedIdentifier') && t.value.includes('\\')
    )
  ) {
    errors.push(FormulaViolations.dialectAmbiguousEscape(fieldName));
  }

  // The same family once more, and the one that needs no ambiguous character: a quoting spelling
  // the scanner does not know (`$$`, `'''`) leaves an unclosed run, and its single token covers the
  // rest of the formula — so every guard above reads an empty formula. Keyed on the scanner's own
  // state rather than on any dialect's quoting rules, which is what makes one check enough.
  if (tokens.some(t => t.unterminated)) {
    errors.push(FormulaViolations.unterminatedQuotedText(fieldName));
  }

  const calls = findFunctionCalls(tokens);
  const aggregates = calls.filter(c => dialect.isAggregateFunction(c.name));
  const aggregateCalls: AggregateCall[] = [];

  // An unclosed call's `argEnd` is only as far as the scan got, not a real boundary
  // (SqlFunctionCall.closed). The FORMULA_UNBALANCED_PARENTHESIS pushed for the call itself,
  // below, already names the real problem — so for deciding whether a *reference* sits inside an
  // aggregate, an unclosed call is read as running to the end of the formula. Otherwise every
  // reference after its `(` would also fail level mixing (or the aggregate-state check just
  // below) as a second, contradictory violation stacked on top of the missing `)`.
  const effectiveArgEnd = (c: SqlFunctionCall) => (c.closed ? c.argEnd : formula.length);
  const coveringCall = (r: FormulaReference) =>
    aggregates.find(c => c.argStart <= r.start && r.end <= effectiveArgEnd(c));

  for (const call of aggregates) {
    if (aggregates.some(other => other !== call && contains(other, call))) {
      errors.push(FormulaViolations.nestedAggregate(fieldName, outerNameOf(aggregates, call)));
      continue;
    }

    // Order matters: an unclosed call reports an empty argument span too, so checking it second
    // would report the wrong problem.
    if (!call.closed) {
      errors.push(FormulaViolations.unbalancedParenthesis(fieldName, call.name));
      continue;
    }

    // Offsets first: two integer comparisons discard most references before the memoised liveness
    // answer is needed at all.
    const inside = references.filter(
      r => call.argStart <= r.start && r.end <= call.argEnd && isLive(r)
    );
    if (inside.length === 0) {
      errors.push(FormulaViolations.aggregateWithoutField(fieldName, call.name));
      continue;
    }

    const owners = new Set(inside.map(r => r.path));
    if (owners.size > 1) {
      errors.push(
        FormulaViolations.aggregateMixesOwners(fieldName, call.name, [
          ...new Set(inside.map(refLabel)),
        ])
      );
      continue;
    }

    aggregateCalls.push({
      name: call.name,
      owner: inside[0].path,
      references: inside,
      nameStart: call.nameStart,
    });
  }

  // RESOLVE, then derive, then judge. The order is the whole point: a referenced Calculated Field's
  // own aggregation lives in ITS string, so this formula's token stream cannot see it, and the level
  // is only knowable once every reference has come back.
  const resolved = references
    .filter(isLive)
    .map(ref => ({ ref, state: input.knownField(ref.path, ref.field) }));

  // Derived from the CALLS the dialect recognises as aggregates and from the levels the references
  // reported, not from the errors: a formula that fails its own rules still has a level, and the
  // caller needs it to pick the right message.
  // A JOINED calculated reference is refused below and contributes NO level: it is never
  // substituted, so letting it make this formula a metric would only disable the permanent
  // row-level joined guard that is the other half of its refusal.
  const level: CalculatedFieldLevel =
    aggregates.length > 0 || resolved.some(r => r.state === 'calculated-metric' && !r.ref.path)
      ? 'metric'
      : 'column';

  // One pass per live reference: is it a known field at all, and — if so — does its state agree
  // with where it sits? An aggregate-level reference — a measure like Unique Count ('aggregate') or an aggregate-level Calculated Field — is legal bare at the metric's own aggregate
  // level but illegal wrapped in another aggregate call; every other state is the reverse — inside
  // an aggregate call at level 'metric', anywhere at level 'column'.
  for (const { ref, state } of resolved) {
    const covered = coveringCall(ref) !== undefined;

    // Its own statement rather than an arm of the chain below, because the rule is PERMANENT
    // and holds whatever the reference turns out to be: a row-level read of a joined
    // field is a per-key collapse, not a row value, even when that field is an already-aggregated
    // measure — a state an arm above would otherwise have claimed first and silently allowed.
    if (level === 'column' && ref.path) {
      errors.push(FormulaViolations.joinedReferenceOutsideAggregate(fieldName, refLabel(ref)));
    }

    // Its own statement for the same reason, and PERMANENT for the same one: the refusal is lifted
    // for the metric's OWN Data Mart only. Substituting a joined formula would need its
    // text — which the blendable payload does not carry — and would join a source that routing and
    // `assertAllRequestedSourcesAccessible` never saw, since both are decided from THIS formula's
    // raw text. An arm of the chain below would not do: the metric level that makes a calculated
    // reference legal bare is exactly what the arm would then claim, silently, with no violation.
    if (ref.path && (state === 'calculated-metric' || state === 'calculated-column')) {
      errors.push(FormulaViolations.calculatedReference(fieldName, refLabel(ref)));
    }

    if (state === 'missing') {
      errors.push(FormulaViolations.unknownReference(fieldName, refLabel(ref), 'missing'));
    } else if (state === 'aggregate') {
      if (covered) errors.push(FormulaViolations.aggregateOnAggregate(fieldName, refLabel(ref)));
    } else if (state === 'calculated-metric') {
      // MUST sit ahead of the level-mixing arm below, not fall into it: a calculated reference is
      // bare by construction, so this very state having made the formula metric-level is what would
      // make that arm reject it — the feature's headline formula, `revenue / cost`, condemned by the
      // rule that exists to allow it.
      if (covered) {
        errors.push(FormulaViolations.calculatedFieldOnAggregate(fieldName, refLabel(ref)));
      }
    } else if (level === 'metric' && !covered) {
      // 'ok' and 'calculated-column' both land here, and deliberately share one arm: a row-level
      // Calculated Field IS an ordinary column as far as grouping is concerned, and giving it a
      // duplicate arm of its own would be two conditions to keep in step for one rule.
      errors.push(FormulaViolations.levelMixing(fieldName, refLabel(ref)));
    }
  }

  if (hasUnguardedDivision(tokens, calls)) {
    warnings.push(FormulaViolations.unguardedDivision(fieldName));
  }

  return {
    aggregateCalls,
    references,
    level,
    errors: dedupeViolations(errors),
    warnings: dedupeViolations(warnings),
  };
}

function hasWord(tokens: readonly SqlToken[], word: string): boolean {
  return tokens.some(t => t.kind === 'word' && t.value.toUpperCase() === word);
}

// Depth is floored at 0 so a stray `)` cannot drive it negative and hide every comma that follows:
// an unbalanced formula is refused elsewhere, and it must not lose this refusal on the way.
function hasTopLevelComma(tokens: readonly SqlToken[]): boolean {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind !== 'punct') continue;
    if (token.value === '(') depth++;
    else if (token.value === ')') depth = Math.max(0, depth - 1);
    else if (token.value === ',' && depth === 0) return true;
  }
  return false;
}

/**
 * The comment markers the warehouses read differently, in order, without repeats.
 *
 * `//` is two `punct` tokens and only means `//` when they ADJOIN — reading the pair off token
 * values alone would also flag `a / b / c`, which is ordinary division. The offsets decide it.
 */
function ambiguousCommentMarkers(tokens: readonly SqlToken[]): string[] {
  const found: string[] = [];
  const add = (marker: string): void => {
    if (!found.includes(marker)) found.push(marker);
  };
  tokens.forEach((token, i) => {
    if (token.kind !== 'punct') return;
    if (token.value === '#') add('#');
    if (token.value === '/') {
      const next = tokens[i + 1];
      if (next?.kind === 'punct' && next.value === '/' && next.start === token.end) add('//');
    }
  });
  return found;
}

const contains = (outer: SqlFunctionCall, inner: SqlFunctionCall) =>
  outer.argStart <= inner.nameStart && inner.argEnd <= outer.argEnd;

const outerNameOf = (all: SqlFunctionCall[], inner: SqlFunctionCall) =>
  all.find(c => c !== inner && contains(c, inner))?.name ?? inner.name;

// Collapses violations identical in every field a caller can see: `SUM(SUM(SUM(x)))` finds the same
// outer aggregate containing two inner calls and would otherwise say the same sentence twice.
//
// The separator is the ESCAPE `\0`, never a literal NUL byte — a source file holding one is treated
// as binary by grep and ripgrep alike, which makes the whole module invisible to search.
function dedupeViolations(violations: FormulaViolation[]): FormulaViolation[] {
  const seen = new Set<string>();
  return violations.filter(v => {
    const key = `${v.code}\0${v.field}\0${v.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A `/` whose right-hand side is neither a numeric literal nor already wrapped in a null-guarding
 * call. Deliberately shallow — an advisory, not a correctness gate. Known gaps, left for a human:
 * a guard around the RESULT of the division still warns, because it does not guard the denominator;
 * IF and CASE guards are not recognised; the guard-function set is fixed rather than per dialect.
 */
function hasUnguardedDivision(
  tokens: readonly SqlToken[],
  calls: readonly SqlFunctionCall[]
): boolean {
  const GUARDS = new Set(['NULLIF', 'SAFE_DIVIDE', 'IFF', 'COALESCE', 'NULLIFZERO', 'DIV0']);
  const code = tokens.filter(t => t.kind !== 'comment');
  return code.some((token, i) => {
    if (!(token.kind === 'punct' && token.value === '/')) return false;
    // Past any parens the analyst wrapped the denominator in, so `a / (NULLIF(b, 0))` reads the
    // same as `a / NULLIF(b, 0)`.
    let j = i + 1;
    while (code[j]?.kind === 'punct' && code[j].value === '(') j++;
    const denominator = code[j];
    if (!denominator) return false;
    if (denominator.kind === 'number') return false;
    // The denominator must BE the guard call. Asking only that it fall somewhere INSIDE one also
    // accepts a guard wrapped around the whole quotient — the case the policy above says still
    // warns, because a guard on the result does nothing about dividing by zero.
    const guarded = calls.some(
      c => GUARDS.has(c.name.toUpperCase()) && c.nameStart === denominator.start
    );
    return !guarded;
  });
}
