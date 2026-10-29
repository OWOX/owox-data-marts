import { scanSql, type SqlToken } from '../calculated-fields/sql-token-scanner';

export interface SqlLexingOptions {
  /**
   * Treat `#` as the start of a line comment, as BigQuery does. The shared scanner does not, so
   * without this an apostrophe after a `#` would open a "string" that swallows the next lines.
   */
  hashLineComments?: boolean;
  /** Treat `//` as the start of a line comment, as Snowflake does, for the same reason. */
  slashLineComments?: boolean;
}

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
  let text = sql;
  if (options.hashLineComments || options.slashLineComments) {
    // Blank each such comment out, left to right, rescanning after each one: the scan before the
    // first comment marker is the only one that can be trusted.
    const startsComment = (token: SqlToken, source: string): boolean =>
      token.kind === 'punct' &&
      ((options.hashLineComments === true && token.value === '#') ||
        (options.slashLineComments === true &&
          token.value === '/' &&
          source[token.start + 1] === '/'));
    for (;;) {
      const marker = scanSql(text).find(token => startsComment(token, text));
      if (!marker) break;
      const end = lineEndFrom(text, marker.start);
      nonCode.push([marker.start, end]);
      text = blank(text, marker.start, end);
    }
  }
  const tokens: SqlToken[] = [];
  for (const token of scanSql(text)) {
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

function lineEndFrom(text: string, from: number): number {
  const offset = text.slice(from).search(/[\r\n]/);
  return offset === -1 ? text.length : from + offset;
}
