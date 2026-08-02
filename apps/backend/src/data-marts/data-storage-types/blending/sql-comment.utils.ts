/**
 * Makes text safe to embed in a `-- ...` SQL comment: embedded newlines or `--` would close
 * the comment and expose the trailing input as executable SQL.
 */
export function sanitizeSqlComment(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/--/g, '—')
    .trim();
}
