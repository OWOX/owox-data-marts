import { SqlParameter } from '../../utils/sql-clause-renderer';

/**
 * Maps renderer SqlParameter[] (positional order) to Athena ExecutionParameters.
 *
 * Athena ExecutionParameters are NOT bound like JDBC values — each element is
 * substituted as a SQL literal/expression. Per AWS docs, "for SQL execution
 * parameters to be treated as strings, they must be enclosed in single quotes".
 * So strings are single-quoted ('' -escaped), numbers/booleans are bare literals,
 * and null becomes NULL. Do not change this to raw values — it would break every
 * string filter.
 * @see https://docs.aws.amazon.com/athena/latest/ug/querying-with-prepared-statements.html
 */
export function toAthenaExecutionParameters(
  params: SqlParameter[] | undefined
): string[] | undefined {
  if (!params || params.length === 0) return undefined;
  return params.map(p => formatAthenaLiteral(p.value));
}

function formatAthenaLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${value.split("'").join("''")}'`;
}

/**
 * Substitutes positional `?` placeholders with their literal values, producing a
 * static, self-contained SQL string. Used by paths that cannot carry runtime
 * ExecutionParameters — a copied data-mart SQL definition or a "generated SQL"
 * preview — so the emitted SQL actually runs (and matches execution) instead of
 * shipping unbound `?`.
 *
 * Because Athena binds ExecutionParameters AS literals anyway (see above), the
 * inlined SQL is byte-for-byte what Athena would execute. Date/time placeholders
 * are already wrapped as `CAST(? AS <type>)` by the renderer, so inlining a
 * string value yields a valid `CAST('2024-01-01' AS DATE)`.
 *
 * `?` inside single-quoted strings or double-quoted identifiers is left intact —
 * those are not parameter markers (matching countPositionalPlaceholders).
 */
export function inlineAthenaPositionalParams(
  sql: string,
  params: SqlParameter[] | undefined
): string {
  if (!params || params.length === 0) return sql;
  let result = '';
  let paramIndex = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      result += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          // Doubled quote = an escaped quote inside the literal; stay in the string.
          result += sql[i + 1];
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      // SQL line comment — copy verbatim to end of line, never interpret its
      // contents. The blended builder embeds the data-mart title/url (free text,
      // often a URL with a `?` query string) as `-- ...` comments; a `?` there is
      // NOT a positional placeholder.
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      result += sql.slice(i, end);
      i = end - 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      result += ch;
      continue;
    }
    if (ch === '?') {
      if (paramIndex >= params.length) {
        throw new Error(
          `inlineAthenaPositionalParams: more '?' placeholders than params (${params.length})`
        );
      }
      result += formatAthenaLiteral(params[paramIndex].value);
      paramIndex++;
      continue;
    }
    result += ch;
  }
  if (paramIndex !== params.length) {
    throw new Error(
      `inlineAthenaPositionalParams: placeholder/param mismatch — consumed ${paramIndex} ` +
        `placeholder(s) but got ${params.length} param(s)`
    );
  }
  return result;
}
