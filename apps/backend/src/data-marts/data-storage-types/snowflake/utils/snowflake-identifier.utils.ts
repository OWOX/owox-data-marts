/**
 * Pattern for identifiers Snowflake accepts unquoted (letters, digits, '_' and '$',
 * not starting with a digit). Anything else must be double-quoted to be safe.
 */
const UNQUOTED_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/**
 * Helper function to quote a single identifier part.
 * Already-quoted parts are unwrapped first to avoid double-quoting,
 * and embedded double quotes are escaped by doubling them.
 * @param part - The identifier part to quote
 * @returns The quoted identifier part
 */
function quoteIdentifierPart(part: string): string {
  const inner =
    part.length >= 2 && part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part;
  return `"${inner.replace(/"/g, '""')}"`;
}

/**
 * Unquotes the database part only when the result is a valid unquoted Snowflake
 * identifier (Snowflake normalizes it to uppercase). Otherwise the part is kept
 * safely quoted — never returned raw.
 */
function unquoteDatabasePart(part: string): string {
  const inner =
    part.length >= 2 && part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part;
  return UNQUOTED_IDENTIFIER_PATTERN.test(inner) ? inner : quoteIdentifierPart(part);
}

/**
 * Escapes Snowflake identifiers by wrapping schema and table in double quotes
 * to preserve case sensitivity. The database name is left unquoted (Snowflake
 * normalizes it to uppercase) only when it is a valid unquoted identifier.
 *
 * Fails closed: inputs that are not a 1-3 part identifier (or contain characters
 * that are unsafe unquoted) have every part quoted with embedded double quotes
 * escaped, so the result is always a quoted identifier rather than raw SQL.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "database.schema.table")
 * @returns Escaped identifier with schema and table wrapped in double quotes
 *
 * @example
 * escapeSnowflakeIdentifier('my_table') // => "my_table"
 * escapeSnowflakeIdentifier('schema.table') // => "schema"."table"
 * escapeSnowflakeIdentifier('database.schema.table') // => database."schema"."table"
 * escapeSnowflakeIdentifier('database."SCHEMA"."TABLE"') // => database."SCHEMA"."TABLE"
 * escapeSnowflakeIdentifier('my-db.schema.table') // => "my-db"."schema"."table"
 * escapeSnowflakeIdentifier('a.b.c.d FROM x --') // => "a"."b"."c"."d FROM x --"
 */
export function escapeSnowflakeIdentifier(identifier: string): string {
  if (!identifier) {
    return identifier;
  }

  const parts = identifier.match(/(?:[^."]+|"[^"]*")+/g) || [];

  if (parts.length === 0) {
    return quoteIdentifierPart(identifier);
  }

  if (parts.length === 3) {
    return `${unquoteDatabasePart(parts[0])}.${quoteIdentifierPart(parts[1])}.${quoteIdentifierPart(parts[2])}`;
  }

  return parts.map(quoteIdentifierPart).join('.');
}

/**
 * Escapes Snowflake schema identifier (database.schema format)
 * Only quotes the schema part, leaving database unquoted when it is a valid
 * unquoted identifier (otherwise it is quoted as well).
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
  return `${unquoteDatabasePart(database)}.${quoteIdentifierPart(schema)}`;
}
