import { scanSql, type SqlToken } from '../calculated-fields/sql-token-scanner';

export interface SqlLexingOptions {
  /**
   * Treat `#` as the start of a line comment, as BigQuery does. The shared scanner does not, so
   * without this an apostrophe after a `#` would open a "string" that swallows the next lines.
   */
  hashLineComments?: boolean;
  /** Treat `//` as the start of a line comment, as Snowflake does, for the same reason. */
  slashLineComments?: boolean;
  /** Read `'''…'''` and `"""…"""` as one string literal, as BigQuery does. */
  tripleQuotedStrings?: boolean;
  /** Read `$$…$$` as one string literal, as Snowflake does. */
  dollarQuotedStrings?: boolean;
  /**
   * A backslash is an ordinary character, as in AWS Athena literals. The shared scanner reads it
   * as an escape, so `'C:\'` would run on as a string over the SQL that follows.
   */
  backslashIsLiteral?: boolean;
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
  // Same length, so every offset still points into `sql`.
  let text = options.backslashIsLiteral ? sql.replace(/\\/g, ' ') : sql;
  // The shared scanner does not know the dialect's own comments and literals. Blank each one out,
  // left to right, rescanning after each: the scan before the first one is the only one to trust.
  for (let run = firstDialectRun(text, options); run; run = firstDialectRun(text, options)) {
    nonCode.push(run);
    text = blank(text, run[0], run[1]);
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

/** The first comment or literal of the dialect that the shared scanner reads differently. */
function firstDialectRun(text: string, options: SqlLexingOptions): [number, number] | null {
  for (const token of scanSql(text)) {
    const at = token.start;
    if (token.kind === 'punct') {
      const next = text[at + 1];
      if (options.hashLineComments && token.value === '#') return [at, lineEndFrom(text, at)];
      if (options.slashLineComments && token.value === '/' && next === '/') {
        return [at, lineEndFrom(text, at)];
      }
      if (options.dollarQuotedStrings && token.value === '$' && next === '$') {
        return [at, closingAfter(text, at, '$$', false)];
      }
    } else if (options.tripleQuotedStrings && token.kind !== 'comment') {
      const delimiter = text.slice(at, at + 3);
      if (delimiter === "'''" || delimiter === '"""') {
        return [at, closingAfter(text, at, delimiter, true)];
      }
    }
  }
  return null;
}

/** Where the literal opened by `delimiter` at `start` ends: after its closing one, or at the end. */
function closingAfter(
  text: string,
  start: number,
  delimiter: string,
  backslashEscapes: boolean
): number {
  for (let at = start + delimiter.length; at < text.length; at++) {
    if (backslashEscapes && text[at] === '\\') {
      at++;
      continue;
    }
    if (text.startsWith(delimiter, at)) return at + delimiter.length;
  }
  return text.length;
}

function lineEndFrom(text: string, from: number): number {
  const offset = text.slice(from).search(/[\r\n]/);
  return offset === -1 ? text.length : from + offset;
}
