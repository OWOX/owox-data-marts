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

function escapeIdentifierPart(part: string, quoteChar: string): string {
  const escaped = part.replace(
    new RegExp(quoteChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    quoteChar + quoteChar
  );
  return `${quoteChar}${escaped}${quoteChar}`;
}

/**
 * Splits a dotted identifier into parts, handles already-quoted parts,
 * and wraps each part in the configured quote character.
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

    // The balanced-pair regex skips a LONE (unbalanced) quote char instead of matching it,
    // which silently drops it and injects a spurious qualifier (e.g. a column literally named
    // `a"b` → `"a"."b"`). Detect a lossy tokenization by reconstructing the input; if it does
    // not round-trip, treat the whole identifier as a single part and double every inner quote
    // — a single legal identifier. Never drops a character, never produces a quote breakout.
    if (parts.join('.') !== identifier) {
      return escapeIdentifierPart(identifier, quoteChar);
    }

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
