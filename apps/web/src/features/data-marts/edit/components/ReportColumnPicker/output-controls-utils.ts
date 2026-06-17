// `\0` cannot occur in aliasPath or column names, so it is a safe delimiter for
// composite map keys / select values built from those two parts.
export function makePreJoinKey(aliasPath: string, column: string): string {
  return `${aliasPath}\0${column}`;
}
