import { SqlParameter } from '../../utils/sql-clause-renderer';

/**
 * Formats a value as a BigQuery SQL literal. Strings are single-quoted with
 * backslash escaping (the backslash is escaped FIRST so a `'` cannot break out
 * of the literal — this escaping is the only thing standing between user input
 * and SQL injection in the inlined SQL). Date/time values arrive as strings and
 * are wrapped in `CAST(... AS <type>)` by the renderer, so a bare string literal
 * inside the cast is correct.
 */
function formatBigQueryLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `'${escaped}'`;
}

/**
 * Substitutes BigQuery named placeholders (`@name`) with their literal values,
 * producing a static, self-contained SQL string for paths that cannot carry
 * runtime query parameters — a copied data-mart SQL definition or a "generated
 * SQL" preview. Date/time placeholders are already wrapped as `CAST(@p AS <type>)`
 * by the renderer, so inlining a string value yields a valid `CAST('...' AS DATE)`.
 *
 * `@name` inside a string literal or quoted identifier is left intact — only real
 * parameter markers (matched against the supplied param names) are substituted.
 */
export function inlineBigQueryNamedParams(sql: string, params: SqlParameter[] | undefined): string {
  if (!params || params.length === 0) return sql;
  const byName = new Map(params.map(p => [p.name, p.value] as const));
  const substituted = new Set<string>();
  let result = '';
  let i = 0;
  let quote: "'" | '"' | '`' | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (quote) {
      result += ch;
      // Backslash escapes the next char inside a string literal (not in `` ` ``).
      if (ch === '\\' && quote !== '`' && i + 1 < sql.length) {
        result += sql[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      // SQL line comment — copy verbatim to end of line, never interpret its
      // contents. The blended builder embeds the data-mart title/url as `-- ...`
      // comments; an `@name`-looking token there is NOT a parameter marker.
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      result += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      result += ch;
      i++;
      continue;
    }
    if (ch === '@') {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      const name = sql.slice(i + 1, j);
      if (byName.has(name)) {
        result += formatBigQueryLiteral(byName.get(name)!);
        substituted.add(name);
        i = j;
        continue;
      }
    }
    result += ch;
    i++;
  }
  if (substituted.size !== byName.size) {
    throw new Error(
      `inlineBigQueryNamedParams: ${byName.size} param(s) supplied but ${substituted.size} ` +
        `placeholder(s) were substituted — every param must appear exactly once in the SQL`
    );
  }
  return result;
}
