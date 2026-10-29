export type SqlTokenKind = 'word' | 'string' | 'comment' | 'quotedIdentifier' | 'number' | 'punct';

export interface SqlToken {
  kind: SqlTokenKind;
  value: string;
  start: number;
  end: number;
  /**
   * The run reached the end of input without its closing mark, so it spans everything after the
   * opening one. Read by the analyzer, which refuses the formula: this scanner ends the text where
   * no warehouse does, and every structural guard reads token kinds.
   */
  unterminated?: true;
}

/**
 * Comments and literals of one warehouse that the scanner does not read by default. All are off
 * for formulas, which the analyzer refuses outright when they hold `#` or a backslash in a literal.
 */
export interface SqlScanOptions {
  /** `#` starts a line comment, as on BigQuery. */
  hashLineComments?: boolean;
  /** `//` starts a line comment, as on Snowflake. */
  slashLineComments?: boolean;
  /** `'''…'''` and `"""…"""` are one string literal, as on BigQuery. */
  tripleQuotedStrings?: boolean;
  /** `$$…$$` is one string literal, as on Snowflake. */
  dollarQuotedStrings?: boolean;
  /** A backslash escapes nothing, as in AWS Athena literals: `'C:\'` ends at its second quote. */
  backslashIsLiteral?: boolean;
}

const WORD_START = /[A-Za-z_]/;
const WORD_BODY = /[A-Za-z0-9_$]/;

/**
 * Lexical structure only. It knows string literals, comments, quoted identifiers, numbers, words
 * and punctuation — no precedence, no syntax validation, no dialect reimplementation. Validating
 * that the SQL is actually well-formed is the warehouse dry run's job.
 */
export function scanSql(sql: string, options: SqlScanOptions = {}): SqlToken[] {
  const tokens: SqlToken[] = [];
  const backslashEscapes = !options.backslashIsLiteral;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    if (
      (c === '-' && sql[i + 1] === '-') ||
      (options.hashLineComments && c === '#') ||
      (options.slashLineComments && c === '/' && sql[i + 1] === '/')
    ) {
      const end = indexOfLineTerminator(sql, i);
      tokens.push({ kind: 'comment', value: sql.slice(i, end), start: i, end });
      i = end;
      continue;
    }

    if (c === '/' && sql[i + 1] === '*') {
      const closed = sql.indexOf('*/', i + 2);
      const end = closed === -1 ? sql.length : closed + 2;
      tokens.push({
        kind: 'comment',
        value: sql.slice(i, end),
        start: i,
        end,
        ...(closed === -1 ? { unterminated: true as const } : {}),
      });
      i = end;
      continue;
    }

    if (options.tripleQuotedStrings && (c === `'` || c === '"') && sql.startsWith(c + c + c, i)) {
      i = readDelimited(sql, i, c + c + c, true, tokens);
      continue;
    }
    if (options.dollarQuotedStrings && c === '$' && sql[i + 1] === '$') {
      i = readDelimited(sql, i, '$$', false, tokens);
      continue;
    }

    if (c === `'`) {
      i = readQuoted(sql, i, `'`, 'string', tokens, backslashEscapes);
      continue;
    }
    if (c === '"') {
      i = readQuoted(sql, i, '"', 'quotedIdentifier', tokens, backslashEscapes);
      continue;
    }
    if (c === '`') {
      i = readQuoted(sql, i, '`', 'quotedIdentifier', tokens, backslashEscapes);
      continue;
    }

    if (c >= '0' && c <= '9') {
      const j = readNumber(sql, i);
      tokens.push({ kind: 'number', value: sql.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    if (WORD_START.test(c)) {
      let j = i + 1;
      while (j < sql.length && WORD_BODY.test(sql[j])) j++;
      tokens.push({ kind: 'word', value: sql.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    tokens.push({ kind: 'punct', value: c, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

// A doubled delimiter escapes itself, and so does a BACKSLASH on four of the five warehouses —
// measured: `SELECT 'it\\'s'` returns `it's` on BigQuery, Redshift, Snowflake and Databricks.
// This used to claim the opposite ("a backslash does not"), and reading `\\'` as an ordinary
// character then made the closing quote look like the opening half of a doubled pair: `'a\\''`
// swallowed the entire rest of the formula into ONE string token. Every structural guard reads
// `punct`/`word` tokens, so all of them went blind at once — a subquery, a `;`, a top-level comma
// and a comment marker alike — while the warehouse, which ends the literal at the escaped quote,
// executed the tail as code.
//
// The remaining divergence (Athena/Trino does NOT escape on backslash) is unreachable for
// formulas: the analyzer refuses a backslash inside a literal outright, for the same reason it
// refuses `#`. Data Mart SQL written for Athena is scanned with `backslashIsLiteral`.
//
// An unterminated literal (no closing delimiter before end of input) still yields one token that
// runs to the end of the string, so the scanner always terminates instead of looping forever. It
// is flagged `unterminated` because that token blinds every structural guard the same way the
// backslash reading above did: `'''don't''' , x` lexes as string / word / string-to-end here,
// while BigQuery reads a closed triple-quoted string and a SECOND select item.
function readQuoted(
  sql: string,
  start: number,
  delim: string,
  kind: SqlTokenKind,
  out: SqlToken[],
  backslashEscapes: boolean
): number {
  let j = start + 1;
  let terminated = false;
  while (j < sql.length) {
    if (backslashEscapes && sql[j] === '\\') {
      j += 2;
      continue;
    }
    if (sql[j] === delim) {
      if (sql[j + 1] === delim) {
        j += 2;
        continue;
      }
      j++;
      terminated = true;
      break;
    }
    j++;
  }
  out.push({
    kind,
    value: sql.slice(start, j),
    start,
    end: j,
    ...(terminated ? {} : { unterminated: true as const }),
  });
  return j;
}

// A string literal that only `delimiter` closes: BigQuery `'''…'''` and `"""…"""`, where a
// backslash still escapes (so `\'''` does not close it, even in a raw `r'''…'''`), and Snowflake
// `$$…$$`, where nothing does.
function readDelimited(
  sql: string,
  start: number,
  delimiter: string,
  backslashEscapes: boolean,
  out: SqlToken[]
): number {
  let j = start + delimiter.length;
  while (j < sql.length) {
    if (backslashEscapes && sql[j] === '\\') {
      j += 2;
      continue;
    }
    if (sql.startsWith(delimiter, j)) {
      const end = j + delimiter.length;
      out.push({ kind: 'string', value: sql.slice(start, end), start, end });
      return end;
    }
    j++;
  }
  out.push({
    kind: 'string',
    value: sql.slice(start),
    start,
    end: sql.length,
    unterminated: true,
  });
  return sql.length;
}

// A line comment ends at ANY line terminator, not at `\n` alone. Measured on all five warehouses:
// `SELECT 1 -- z<CR>+10 AS v` returns 11 everywhere, so every one of them ends the comment at a
// lone CR. Ending it at `\n` here — while CR was already skipped as whitespace above — hid a
// second select item, and a `;`, inside a single `comment` token, where neither single-expression
// guard could see it: both read `punct` tokens only.
function indexOfLineTerminator(text: string, from: number): number {
  for (let at = from; at < text.length; at++) {
    const ch = text[at];
    if (ch === '\n' || ch === '\r') return at;
  }
  return text.length;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

// A numeric literal is a run of digits, then at most one fractional part (a dot followed by at
// least one digit), then at most one exponent — and an exponent only counts when its `e`/`E` is
// followed by an optional sign and at least one digit. Anything else touching the digits, most
// importantly a bare `+` or `-` with no digit behind it, is left for the caller to tokenize as
// its own punctuation rather than being folded into the number.
function readNumber(sql: string, start: number): number {
  let j = start;
  while (isDigit(sql[j])) j++;

  if (sql[j] === '.' && isDigit(sql[j + 1])) {
    j++;
    while (isDigit(sql[j])) j++;
  }

  if (sql[j] === 'e' || sql[j] === 'E') {
    let k = j + 1;
    if (sql[k] === '+' || sql[k] === '-') k++;
    const digitsStart = k;
    while (isDigit(sql[k])) k++;
    if (k > digitsStart) j = k;
  }

  return j;
}
