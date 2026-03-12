/**
 * Escaping Redshift identifiers to prevent SQL injection
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Identifier Rules
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

/**
 * @example
 * escapeRedshiftIdentifier('my_table') // => "my_table"
 * escapeRedshiftIdentifier('schema.table') // => "schema"."table"
 * escapeRedshiftIdentifier('database.schema.table') // => "database"."schema"."table"
 * escapeRedshiftIdentifier('table"with"quotes') // => "table""with""quotes"
 */
export const escapeRedshiftIdentifier = createIdentifierEscaper({ quoteChar: '"' });
