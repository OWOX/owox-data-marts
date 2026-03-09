/**
 * Utility functions for escaping Redshift identifiers to prevent SQL injection
 */

/**
 * Escapes a single identifier part by wrapping it in double quotes
 * and escaping internal double quotes by doubling them (SQL standard)
 * @param part - The identifier part to escape
 * @returns The escaped identifier part
 */
function escapeIdentifierPart(part: string): string {
  // Escape internal double quotes by doubling them (SQL standard for double quote escaping)
  const escaped = part.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Escapes Redshift identifiers by properly handling quoted and unquoted parts.
 * Splits the identifier by dots, preserving quoted sections.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "database.schema.table")
 * @returns Escaped identifier with all parts properly quoted and internal quotes escaped
 *
 * @example
 * escapeRedshiftIdentifier('my_table') // => "my_table"
 * escapeRedshiftIdentifier('schema.table') // => "schema"."table"
 * escapeRedshiftIdentifier('database.schema.table') // => "database"."schema"."table"
 * escapeRedshiftIdentifier('table"with"quotes') // => "table""with""quotes"
 */
export function escapeRedshiftIdentifier(identifier: string): string {
  if (!identifier) {
    return identifier;
  }

  // Parse identifier parts, handling quoted sections properly
  // This regex matches either:
  // - Unquoted sequences of non-dot, non-quote characters
  // - Quoted sequences: " followed by any chars except ", then "
  const parts = identifier.match(/(?:[^."]+|"[^"]*")+/g) || [];

  return parts
    .map(part => {
      // Check if already quoted
      if (part.startsWith('"') && part.endsWith('"') && part.length >= 2) {
        // Already quoted, but we need to escape any internal quotes
        // Remove outer quotes, escape internal ones, re-wrap
        const inner = part.slice(1, -1);
        return escapeIdentifierPart(inner);
      }
      // Not quoted - escape and wrap
      return escapeIdentifierPart(part);
    })
    .join('.');
}
