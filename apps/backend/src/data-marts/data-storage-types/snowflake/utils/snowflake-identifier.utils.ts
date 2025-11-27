/**
 * Escapes Snowflake identifiers by wrapping schema and table in double quotes
 * to preserve case sensitivity. Database name is left unquoted as Snowflake
 * normalizes it to uppercase.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "database.schema.table")
 * @returns Escaped identifier with schema and table wrapped in double quotes
 *
 * @example
 * escapeSnowflakeIdentifier('my_table') // => "my_table"
 * escapeSnowflakeIdentifier('schema.table') // => "schema"."table"
 * escapeSnowflakeIdentifier('database.schema.table') // => database."schema"."table"
 */
export function escapeSnowflakeIdentifier(identifier: string): string {
  if (!identifier) {
    return identifier;
  }

  const parts = identifier.split('.');

  // Single identifier (just table name)
  if (parts.length === 1) {
    return `"${parts[0]}"`;
  }

  // schema.table
  if (parts.length === 2) {
    return `"${parts[0]}"."${parts[1]}"`;
  }

  // database.schema.table - only quote schema and table
  if (parts.length === 3) {
    return `${parts[0]}."${parts[1]}"."${parts[2]}"`;
  }

  // Fallback for unexpected format
  return identifier;
}

/**
 * Escapes Snowflake schema identifier (database.schema format)
 * Only quotes the schema part, leaving database unquoted.
 *
 * @param database - Database name
 * @param schema - Schema name
 * @returns Escaped schema identifier
 *
 * @example
 * escapeSnowflakeSchema('database', 'schema') // => database."schema"
 */
export function escapeSnowflakeSchema(database: string, schema: string): string {
  return `${database}."${schema}"`;
}
