/**
 * Helper to add quotes if not already quoted
 * @param name - Identifier name
 * @returns Quoted identifier
 */
export function quoteIdentifier(name: string): string {
  if (name.startsWith('"') && name.endsWith('"')) {
    return name; // Already quoted
  }
  return `"${name}"`; // Add quotes
}

/**
 * Helper to remove quotes from identifier (for display in UI)
 * @param name - Identifier name
 * @returns Unquoted identifier
 */
export function unquoteIdentifier(name: string): string {
  if (name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1);
  }
  return name;
}
