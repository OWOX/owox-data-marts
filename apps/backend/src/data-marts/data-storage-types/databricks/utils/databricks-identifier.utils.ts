/**
 * Escapes a Databricks identifier using backticks
 * @param identifier - The identifier to escape (table name, column name, etc.)
 * @returns Escaped identifier
 */
export function escapeDatabricksIdentifier(identifier: string): string {
  // Escape backticks within the identifier by doubling them
  const escaped = identifier.replace(/`/g, '``');
  return `\`${escaped}\``;
}

/**
 * Escapes a fully qualified Databricks identifier (catalog.schema.table)
 * @param parts - Array of identifier parts [catalog, schema, table] or [schema, table] or [table]
 * @returns Escaped fully qualified identifier
 */
export function escapeFullyQualifiedIdentifier(parts: string[]): string {
  return parts.map(escapeDatabricksIdentifier).join('.');
}
