/**
 * Utility functions for escaping Athena identifiers to prevent SQL injection
 *
 * @see {@link https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html} Athena Naming Rules
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

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
export const escapeAthenaIdentifier = createIdentifierEscaper({ quoteChar: '"' });
