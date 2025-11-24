export function isReadonlyQuery(sql: string): boolean {
  const cleaned = sql
    .trim()
    .replace(/^--.*$/gm, '') // remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
    .trim()
    .replace(/^\(+/, '') // strip leading parentheses
    .trim();

  return /^(WITH|SELECT)\b/i.test(cleaned);
}
