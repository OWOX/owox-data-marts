/**
 * Helper function to quote a single identifier part if not already quoted
 * @param part - The identifier part to quote
 * @returns The quoted identifier part
 */
function quoteIdentifierPart(part: string): string {
  if (part.startsWith('"') && part.endsWith('"')) {
    return part;
  }
  return `"${part}"`;
}

/**
 * Escapes Snowflake identifiers by wrapping schema and table in double quotes
 * to preserve case sensitivity. Database name is left unquoted as Snowflake
 * normalizes it to uppercase.
 *
 * If parts are already quoted, they won't be quoted again to avoid double-quoting.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "database.schema.table")
 * @returns Escaped identifier with schema and table wrapped in double quotes
 *
 * @example
 * escapeSnowflakeIdentifier('my_table') // => "my_table"
 * escapeSnowflakeIdentifier('schema.table') // => "schema"."table"
 * escapeSnowflakeIdentifier('database.schema.table') // => database."schema"."table"
 * escapeSnowflakeIdentifier('database."SCHEMA"."TABLE"') // => database."SCHEMA"."TABLE"
 */
export function escapeSnowflakeIdentifier(identifier: string): string {
  if (!identifier) {
    return identifier;
  }

  const parts = identifier.match(/(?:[^."]+|"[^"]*")+/g) || [];

  if (parts.length === 1) {
    return quoteIdentifierPart(parts[0]);
  }

  if (parts.length === 2) {
    return `${quoteIdentifierPart(parts[0])}.${quoteIdentifierPart(parts[1])}`;
  }

  if (parts.length === 3) {
    const database =
      parts[0].startsWith('"') && parts[0].endsWith('"') ? parts[0].slice(1, -1) : parts[0];

    return `${database}.${quoteIdentifierPart(parts[1])}.${quoteIdentifierPart(parts[2])}`;
  }

  // Fallback for unexpected format
  return identifier;
}

/**
 * Escapes Snowflake schema identifier (database.schema format)
 * Only quotes the schema part, leaving database unquoted.
 * If schema is already quoted, it won't be quoted again.
 *
 * @param database - Database name
 * @param schema - Schema name
 * @returns Escaped schema identifier
 *
 * @example
 * escapeSnowflakeSchema('database', 'schema') // => database."schema"
 * escapeSnowflakeSchema('database', '"SCHEMA"') // => database."SCHEMA"
 */
export function escapeSnowflakeSchema(database: string, schema: string): string {
  const dbName =
    database.startsWith('"') && database.endsWith('"') ? database.slice(1, -1) : database;

  return `${dbName}.${quoteIdentifierPart(schema)}`;
}
