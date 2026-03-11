/**
 * Utility functions for escaping Redshift identifiers to prevent SQL injection
 *
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Identifier Rules
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

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
export const escapeRedshiftIdentifier = createIdentifierEscaper({ quoteChar: '"' });
