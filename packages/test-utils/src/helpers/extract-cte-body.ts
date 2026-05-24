/**
 * Extracts the body of a named CTE block from a generated SQL string.
 *
 * Locates `<name> AS (` and returns the substring up to (and including) the
 * matching closing `)`, accounting for nested parentheses. Throws when the
 * marker is not present.
 *
 * Prefer this over fragile newline-based slicing (`indexOf('\n\n')`), which
 * silently slides into the next CTE if the builder ever changes its
 * inter-CTE separator.
 */
export function extractCteBody(sql: string, cteName: string): string {
  const marker = `${cteName} AS (`;
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`CTE "${cteName}" not found in SQL`);

  let depth = 0;
  let i = start + marker.length - 1;
  for (; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  return sql.slice(start, i + 1);
}
