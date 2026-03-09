/**
 * Utility functions for escaping BigQuery identifiers to prevent SQL injection
 *
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical#quoted_identifiers} BigQuery Quoted Identifiers
 */

/**
 * Escapes a single identifier part by wrapping it in backticks
 * and escaping internal backticks by doubling them
 * @param part - The identifier part to escape
 * @returns The escaped identifier part
 */
function escapeIdentifierPart(part: string): string {
  // Escape internal backticks by doubling them
  const escaped = part.replace(/`/g, '``');
  return `\`${escaped}\``;
}

/**
 * Escapes BigQuery identifiers by properly handling quoted and unquoted parts.
 * Splits the identifier by dots, preserving quoted sections.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "project.dataset.table")
 * @returns Escaped identifier with all parts properly quoted and internal backticks escaped
 *
 * @example
 * escapeBigQueryIdentifier('my_table') // => `my_table`
 * escapeBigQueryIdentifier('dataset.table') // => `dataset`.`table`
 * escapeBigQueryIdentifier('project.dataset.table') // => `project`.`dataset`.`table`
 * escapeBigQueryIdentifier('table`with`backticks') // => `table``with``backticks`
 */
export function escapeBigQueryIdentifier(identifier: string): string {
  if (!identifier) {
    return identifier;
  }

  // Parse identifier parts, handling quoted sections properly
  // This regex matches either:
  // - Unquoted sequences of non-dot, non-backtick characters
  // - Quoted sequences: ` followed by any chars except `, then `
  const parts = identifier.match(/(?:[^.`]+|`[^`]*`)+/g) || [];

  return parts
    .map(part => {
      // Check if already quoted with backticks
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        // Already quoted, but we need to escape any internal backticks
        // Remove outer quotes, escape internal ones, re-wrap
        const inner = part.slice(1, -1);
        return escapeIdentifierPart(inner);
      }
      // Not quoted - escape and wrap
      return escapeIdentifierPart(part);
    })
    .join('.');
}
