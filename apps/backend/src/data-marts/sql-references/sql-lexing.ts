import {
  scanSql,
  type SqlScanOptions,
  type SqlToken,
} from '../calculated-fields/sql-token-scanner';

/**
 * The comments and literals of the Data Mart's warehouse. Without them an apostrophe in a `#`
 * comment, say, would open a "string" that hides the references after it.
 */
export type SqlLexingOptions = SqlScanOptions;

export interface LexedSql {
  /** Every token except comments, in order. */
  tokens: SqlToken[];
  /** Offsets covered by comments, string literals and quoted identifiers. */
  nonCode: Array<[number, number]>;
}

const NON_CODE_KINDS: ReadonlySet<SqlToken['kind']> = new Set([
  'string',
  'comment',
  'quotedIdentifier',
]);

/** Lexes `sql` into its tokens and its non-code ranges. Offsets are offsets into `sql`. */
export function lexSql(sql: string, options: SqlLexingOptions = {}): LexedSql {
  const nonCode: Array<[number, number]> = [];
  const tokens: SqlToken[] = [];
  for (const token of scanSql(sql, options)) {
    if (NON_CODE_KINDS.has(token.kind)) nonCode.push([token.start, token.end]);
    if (token.kind !== 'comment') tokens.push(token);
  }
  return { tokens, nonCode };
}

/** Replaces `[start, end)` with spaces, keeping every other offset where it was. */
export function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

export function isWord(token: SqlToken | undefined, word: string): boolean {
  return token?.kind === 'word' && token.value.toLowerCase() === word;
}

export function isPunct(token: SqlToken | undefined, value: string): boolean {
  return token?.kind === 'punct' && token.value === value;
}

/** Index of the `)` that closes the `(` at `openIndex`, or -1 when it never closes. */
export function matchingParen(tokens: readonly SqlToken[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index++) {
    if (isPunct(tokens[index], '(')) depth++;
    else if (isPunct(tokens[index], ')')) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}
