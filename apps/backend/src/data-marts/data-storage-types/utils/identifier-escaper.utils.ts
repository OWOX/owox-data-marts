/**
 * Shared factory for escaping SQL identifiers across data storage types.
 *
 * Most storage types follow the same pattern: split a dotted identifier into
 * parts, wrap each part in a quote character, and escape inner occurrences of
 * that quote character by doubling them.
 *
 * Snowflake is the exception (database part is unquoted) and is handled separately.
 */

export interface IdentifierEscaperConfig {
  /** The quote character used by this storage type (e.g. '`' for BigQuery/Databricks, '"' for Athena/Redshift) */
  quoteChar: '`' | '"';
}

/**
 * Escapes a single identifier part by wrapping it in the quote character
 * and escaping inner occurrences by doubling them.
 */
function escapeIdentifierPart(part: string, quoteChar: string): string {
  const escaped = part.replace(
    new RegExp(quoteChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    quoteChar + quoteChar
  );
  return `${quoteChar}${escaped}${quoteChar}`;
}

/**
 * Creates an identifier escaper for a given quote character.
 *
 * The returned function:
 * - Splits a dotted identifier (e.g. "schema.table") into parts
 * - Handles already-quoted parts (strips outer quotes, re-escapes)
 * - Wraps each part in the configured quote character
 *
 * @param config - Storage-specific escaper configuration
 * @returns A function that escapes a full identifier string
 */
export function createIdentifierEscaper(
  config: IdentifierEscaperConfig
): (identifier: string) => string {
  const { quoteChar } = config;
  const escapedChar = quoteChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const partsRegex = new RegExp(
    `(?:[^.${escapedChar}]+|${escapedChar}[^${escapedChar}]*${escapedChar})+`,
    'g'
  );

  return (identifier: string): string => {
    if (!identifier) {
      return identifier;
    }

    const parts = identifier.match(partsRegex) || [];

    return parts
      .map(part => {
        if (part.startsWith(quoteChar) && part.endsWith(quoteChar) && part.length >= 2) {
          const inner = part.slice(1, -1);
          return escapeIdentifierPart(inner, quoteChar);
        }
        return escapeIdentifierPart(part, quoteChar);
      })
      .join('.');
  };
}
