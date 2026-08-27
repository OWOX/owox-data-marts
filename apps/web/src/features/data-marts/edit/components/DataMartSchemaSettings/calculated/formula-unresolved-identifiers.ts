/**
 * Finds the names in a formula that the editor could NOT turn into a field reference.
 *
 * Without this, such a name is simply left in the authoring text and shipped to the backend as
 * literal SQL: `toStoredForm` only substitutes the spans `resolveAll` managed to resolve. A typo,
 * a renamed field, or a joined name whose alias or field the join tree no longer has, therefore
 * all reached the warehouse as bare text, and the analyst got whichever backend error happened to
 * fire — most often `FORMULA_AGGREGATE_WITHOUT_FIELD` ("SUM references no field"), which is false
 * about the cause and points at a fix that cannot work.
 *
 * Web-only by design: the backend never sees an unresolved name (it only ever receives `{{ref}}`
 * tags plus real SQL), so there is nothing here to mirror and this module must NOT be added to
 * `backend-mirror.test.ts`. The scanner it uses IS a mirrored port — use it, never edit it.
 */

import type { ResolvedReference } from './formula-authoring';
import { scanSql, type SqlToken } from './sql-token-scanner';

export interface UnresolvedIdentifier {
  /** The name as it appears in the formula, e.g. `clickz` or `orders.amount`. */
  name: string;
  start: number;
  end: number;
  /** True for a dotted name — the shape a joined reference takes. See `describe…` below. */
  qualified: boolean;
}

export interface UnresolvedIdentifierOptions {
  /** The dialect's aggregate names, so a bare `COUNT` is not read as a missing column. */
  functionNames?: readonly string[];
}

/**
 * SQL words that are never a column: keywords, type names, date parts and the niladic functions
 * that take no parentheses. Deliberately OVER-inclusive — the two failure directions are not
 * symmetric. A missing entry blocks a formula that is perfectly valid; a superfluous one only
 * means a column that shares a keyword's spelling goes unflagged, and such a column still
 * resolves normally when it really is in the schema.
 *
 * `SELECT` and `OVER` are deliberately absent: the backend rejects both outright
 * (FORMULA_SUBQUERY_NOT_ALLOWED, FORMULA_WINDOW_NOT_ALLOWED) and listing them here would only
 * make this check quietly agree with them.
 */
const SQL_WORDS = new Set([
  'AND',
  'ANY',
  'ARRAY',
  'AS',
  'ASC',
  'AT',
  'BETWEEN',
  'BIGDECIMAL',
  'BIGINT',
  'BIGNUMERIC',
  'BINARY',
  'BOOL',
  'BOOLEAN',
  'BY',
  'BYTEINT',
  'BYTES',
  'CASE',
  'CHAR',
  'CHARACTER',
  'COLLATE',
  'CROSS',
  'CURRENT_DATE',
  'CURRENT_DATETIME',
  'CURRENT_TIME',
  'CURRENT_TIMESTAMP',
  'CURRENT_USER',
  'DATE',
  'DATETIME',
  'DAY',
  'DAYOFWEEK',
  'DAYOFYEAR',
  'DEC',
  'DECIMAL',
  'DESC',
  'DISTINCT',
  'DOUBLE',
  'ELSE',
  'END',
  'EPOCH',
  'ESCAPE',
  'EXCEPT',
  'EXISTS',
  'FALSE',
  'FILTER',
  'FIRST',
  'FLOAT',
  'FLOAT4',
  'FLOAT8',
  'FLOAT64',
  'FOLLOWING',
  'FROM',
  'GEOGRAPHY',
  'GROUP',
  'HOUR',
  'IGNORE',
  'ILIKE',
  'IN',
  'INT',
  'INT2',
  'INT4',
  'INT8',
  'INT64',
  'INTEGER',
  'INTERVAL',
  'IS',
  'ISOWEEK',
  'ISOYEAR',
  'JSON',
  'LAST',
  'LIKE',
  'LIMIT',
  'LOCALTIME',
  'LOCALTIMESTAMP',
  'MICROSECOND',
  'MILLISECOND',
  'MINUTE',
  'MONTH',
  'NOT',
  'NULL',
  'NULLS',
  'NUMBER',
  'NUMERIC',
  'OBJECT',
  'OF',
  'ON',
  'OR',
  'ORDER',
  'PRECEDING',
  'QUARTER',
  'RANGE',
  'REAL',
  'RESPECT',
  'ROW',
  'ROWS',
  'SECOND',
  'SEPARATOR',
  'SESSION_USER',
  'SMALLINT',
  'STRING',
  'STRUCT',
  'SYSDATE',
  'TEXT',
  'THEN',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMP_LTZ',
  'TIMESTAMP_NTZ',
  'TIMESTAMP_TZ',
  'TINYINT',
  'TRUE',
  'UNBOUNDED',
  'UNKNOWN',
  'USING',
  'VARBINARY',
  'VARCHAR',
  'VARIANT',
  'WEEK',
  'WHEN',
  'WHERE',
  'WITHIN',
  'YEAR',
  'ZONE',
]);

interface NameChain {
  name: string;
  start: number;
  end: number;
  /** Index into the token list of the token that follows the chain, or -1 at end of input. */
  nextTokenIndex: number;
}

/**
 * Groups word tokens into qualified names: `orders`, `.`, `amount` is ONE name, not two. Only
 * `word` tokens take part, which is what keeps a name inside a string literal, a comment or a
 * quoted identifier out of the result — the scanner already gave each of those its own token kind.
 */
function nameChains(tokens: readonly SqlToken[]): NameChain[] {
  const chains: NameChain[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'word') continue;
    const parts = [tokens[i].value];
    let last = i;
    while (
      tokens[last + 1]?.kind === 'punct' &&
      tokens[last + 1].value === '.' &&
      tokens[last + 2]?.kind === 'word'
    ) {
      parts.push(tokens[last + 2].value);
      last += 2;
    }
    const next = last + 1;
    chains.push({
      name: parts.join('.'),
      start: tokens[i].start,
      end: tokens[last].end,
      nextTokenIndex: next < tokens.length ? next : -1,
    });
    i = last;
  }
  return chains;
}

/**
 * The next token that is real SQL to the warehouse, comments skipped. The backend drops comment
 * tokens before it pairs a name with the `(` that makes it a call (`findFunctionCalls` in
 * sql-function-calls.ts), so a bracketed comment sitting between a function name and its opening
 * paren must not turn a legal call into a missing column here either.
 */
function nextCodeToken(tokens: readonly SqlToken[], from: number): SqlToken | undefined {
  if (from === -1) return undefined;
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i].kind !== 'comment') return tokens[i];
  }
  return undefined;
}

const overlapsAnyReference = (chain: NameChain, refs: readonly ResolvedReference[]): boolean =>
  refs.some(ref => chain.start < ref.end && ref.start < chain.end);

/**
 * Every name in `text` that is not a resolved reference, a function call, a dialect aggregate or
 * a SQL word — reported in the order it appears, once per distinct name.
 *
 * A name followed by `(` is treated as a function call whatever it is called: the dialect list
 * here holds aggregates only, and a formula legitimately uses scalar functions the list has never
 * heard of (`NULLIF`, `COALESCE`, `SAFE_DIVIDE`, `ROUND`). Whether such a call actually exists in
 * the warehouse is the dry run's question, not this one's.
 */
export function findUnresolvedIdentifiers(
  text: string,
  refs: readonly ResolvedReference[],
  options: UnresolvedIdentifierOptions = {}
): UnresolvedIdentifier[] {
  const functions = new Set((options.functionNames ?? []).map(name => name.toUpperCase()));
  const tokens = scanSql(text);
  const found: UnresolvedIdentifier[] = [];
  const seen = new Set<string>();

  for (const chain of nameChains(tokens)) {
    const next = nextCodeToken(tokens, chain.nextTokenIndex);
    if (next?.kind === 'punct' && next.value === '(') continue;

    const upper = chain.name.toUpperCase();
    if (functions.has(upper) || SQL_WORDS.has(upper)) continue;
    if (overlapsAnyReference(chain, refs)) continue;
    if (seen.has(chain.name)) continue;

    seen.add(chain.name);
    found.push({
      name: chain.name,
      start: chain.start,
      end: chain.end,
      qualified: chain.name.includes('.'),
    });
  }

  return found;
}

const unknownMessage = (name: string): string =>
  `\`${name}\` is not a field of this Data Mart. Check the spelling, or pick a field from the ` +
  `suggestions.`;

/**
 * What a QUALIFIED name gets instead when the join tree is not known: `orders.amount` may well be a
 * joined field, and saying it is not a field of this Data Mart would be an assertion nothing here
 * can support. Refusing the save is still right — the name would otherwise travel to the backend as
 * bare SQL and come back as "SUM references no field", the very confusion this module exists to
 * prevent — but the refusal has to name OUR failure, not the analyst's.
 */
const uncheckedMessage = (name: string): string =>
  `\`${name}\` could not be checked against the joined Data Marts.`;

const JOIN_TREE_NOTES: Readonly<Record<Exclude<JoinTreeState, 'ready'>, string>> = {
  loading: 'They are still loading — wait a moment, then save again.',
  unavailable: 'Loading them failed — reload the page, then save again.',
};

/**
 * Added once, and only when some unresolved name is QUALIFIED (`orders.amount`) — the shape a
 * joined reference takes. A joined field IS referenceable now, so this no longer announces a
 * missing feature; it names the three states that stop such a name from resolving, all of which
 * the backend refuses at save (`joinedPathNotFound`, `joinedFieldUnknown`, `joinedFieldHidden`).
 *
 * It states what to CHECK rather than asserting the name is joined at all, which keeps it true for
 * the other thing a failed dotted name can be: a typo in a nested struct path.
 */
const JOINED_NOTE =
  'A joined Data Mart field is written as `join alias`.`field` — check that the alias still names ' +
  'a joined Data Mart and that the field is not hidden there.';

/**
 * Whether the joined Data Marts behind the offered fields are actually known — mirrors
 * `JoinedFieldsStatus` in joined-fields-context.ts. Defaults to 'ready', which is what an empty
 * join tree and a Data Mart with no joins both are.
 */
export type JoinTreeState = 'ready' | 'loading' | 'unavailable';

/** One sentence per unresolved name, or null when there are none. */
export function describeUnresolvedIdentifiers(
  identifiers: readonly UnresolvedIdentifier[],
  joinTree: JoinTreeState = 'ready'
): string | null {
  if (identifiers.length === 0) return null;
  const joinTreeKnown = joinTree === 'ready';
  const sentences = identifiers.map(id =>
    id.qualified && !joinTreeKnown ? uncheckedMessage(id.name) : unknownMessage(id.name)
  );
  if (identifiers.some(id => id.qualified)) {
    sentences.push(joinTreeKnown ? JOINED_NOTE : JOIN_TREE_NOTES[joinTree]);
  }
  return sentences.join(' ');
}
