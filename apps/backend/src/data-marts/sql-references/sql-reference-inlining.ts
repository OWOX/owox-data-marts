import { sanitizeSqlComment } from '../data-storage-types/blending/sql-comment.utils';
import { isPunct, isWord, lexSql, matchingParen, type SqlLexingOptions } from './sql-lexing';

/**
 * Helpers that decide how a referenced Data Mart's SQL can be placed into another query, and
 * render it there. They read lexical structure only; the warehouse remains the judge of whether
 * the SQL is valid.
 */

/**
 * `sql` as one statement that can sit inside parentheses: trailing semicolons go, and a
 * trailing comment after them goes too. Returns null when a semicolon is followed by more code,
 * i.e. a multi-statement script, which cannot be nested in a FROM clause.
 */
export function toSingleStatement(sql: string, options: SqlLexingOptions = {}): string | null {
  const { tokens } = lexSql(sql, options);
  const firstSemicolon = tokens.findIndex(token => isPunct(token, ';'));
  if (firstSemicolon === -1) return sql.trim();
  const trailingOnly = tokens.slice(firstSemicolon).every(token => isPunct(token, ';'));
  if (!trailingOnly) return null;
  return sql.slice(0, tokens[firstSemicolon].start).trim();
}

/** Whether `sql` starts with `WITH RECURSIVE`. */
export function isRecursiveQuery(sql: string, options: SqlLexingOptions = {}): boolean {
  const { tokens } = lexSql(sql, options);
  return isWord(tokens[0], 'with') && isWord(tokens[1], 'recursive');
}

/**
 * Whether `sql` has a WITH keyword anywhere outside literals and comments. Deliberately loose —
 * it also matches `TIMESTAMP WITH TIME ZONE` — because callers use it to decide when NOT to
 * inline, and a false positive only falls back to the slower but always valid technical view.
 */
export function containsWithKeyword(sql: string, options: SqlLexingOptions = {}): boolean {
  return lexSql(sql, options).tokens.some(token => isWord(token, 'with'));
}

/**
 * Offsets of the bodies of the top-level CTEs of `sql`: for `WITH a AS (…), b AS (…) SELECT …`,
 * the text inside each pair of parentheses. Empty when `sql` does not start with WITH.
 */
export function topLevelCteBodies(
  sql: string,
  options: SqlLexingOptions = {}
): Array<[number, number]> {
  const { tokens } = lexSql(sql, options);
  const bodies: Array<[number, number]> = [];
  if (!isWord(tokens[0], 'with')) return bodies;

  let index = isWord(tokens[1], 'recursive') ? 2 : 1;
  while (index < tokens.length) {
    index++; // the CTE name
    if (isPunct(tokens[index], '(')) {
      // an explicit column list
      const close = matchingParen(tokens, index);
      if (close === -1) return bodies;
      index = close + 1;
    }
    // `AS`, and on some warehouses `[NOT] MATERIALIZED`, up to the body's `(`.
    while (index < tokens.length && !isPunct(tokens[index], '(')) index++;
    const close = matchingParen(tokens, index);
    if (close === -1) return bodies;
    bodies.push([tokens[index].end, tokens[close].start]);
    index = close + 1;
    if (!isPunct(tokens[index], ',')) break;
    index++;
  }
  return bodies;
}

// Words that may follow a table in FROM without being its alias.
const NOT_AN_ALIAS = new Set([
  'where',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'natural',
  'outer',
  'on',
  'using',
  'group',
  'order',
  'limit',
  'offset',
  'fetch',
  'union',
  'except',
  'intersect',
  'minus',
  'having',
  'window',
  'qualify',
  'lateral',
  'tablesample',
  'pivot',
  'unpivot',
  'for',
  'into',
  'values',
  'select',
  'from',
  'when',
  'then',
  'else',
  'end',
]);

/**
 * Whether the text after `offset` in `sql` starts with an alias (`AS x`, or a bare `x` that is
 * not a keyword). `sql` should have its references masked so their titles do not confuse the lexer.
 */
export function hasAliasAt(sql: string, offset: number, options: SqlLexingOptions = {}): boolean {
  const next = lexSql(sql.slice(offset), options).tokens[0];
  if (!next) return false;
  if (next.kind === 'quotedIdentifier') return true;
  if (next.kind !== 'word') return false; // `,`, `)`, `;` or the end of the statement
  const word = next.value.toLowerCase();
  return word === 'as' || !NOT_AN_ALIAS.has(word);
}

/**
 * Wraps a referenced Data Mart's SQL as a derived table. The label goes into a comment so the
 * resolved query still says where each block came from. The closing parenthesis gets its own
 * line: a `--` comment on the last line of `body` would otherwise swallow it.
 */
export function renderDerivedTable(body: string, label: string): string {
  return `(\n-- Data Mart: ${sanitizeSqlComment(label)}\n${body}\n)`;
}
