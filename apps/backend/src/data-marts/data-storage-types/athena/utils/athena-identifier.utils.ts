/**
 * Utility functions for escaping Athena identifiers to prevent SQL injection
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
 * Escapes Athena identifiers by properly handling quoted and unquoted parts.
 * Splits the identifier by dots, preserving quoted sections.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "database.schema.table")
 * @returns Escaped identifier with all parts properly quoted and internal quotes escaped
 *
 * @example
 * escapeAthenaIdentifier('my_table') // => "my_table"
 * escapeAthenaIdentifier('schema.table') // => "schema"."table"
 * escapeAthenaIdentifier('database.schema.table') // => "database"."schema"."table"
 * escapeAthenaIdentifier('table"with"quotes') // => "table""with""quotes"
 */
export function escapeAthenaIdentifier(identifier: string): string {
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

/**
 * Validates if a string is a safe Athena identifier without dangerous characters
 * This is a defense-in-depth check to catch potential injection attempts
 * @param identifier - The identifier to validate
 * @returns Boolean indicating if the identifier is safe
 */
export function isValidAthenaIdentifier(identifier: string): boolean {
  if (!identifier || identifier.length === 0) {
    return false;
  }

  // Check for potentially dangerous characters/patterns that could indicate SQL injection
  const dangerousPatterns = [
    /;.*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)/i, // SQL keywords after semicolon
    /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i, // Standalone SQL keywords
    /\bUNION\b.*\bSELECT\b/i, // UNION SELECT pattern
    /--/, // SQL comment
    /\/\*/, // Multi-line comment start
    /\\x/, // Hex encoding attempt
    /(?:\b|\s+)(?:OR|AND)\s+["']?[\d\w]+["']?\s*=\s*["']?[\d\w]+["']?/i, // Boolean-based injection
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(identifier)) {
      return false;
    }
  }

  return true;
}
