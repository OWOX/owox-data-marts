/**
 * Escaping Athena identifiers to prevent SQL injection
 * @see {@link https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html} Athena Naming Rules
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

/**
 * @example
 * escapeAthenaIdentifier('my_table') // => "my_table"
 * escapeAthenaIdentifier('schema.table') // => "schema"."table"
 * escapeAthenaIdentifier('database.schema.table') // => "database"."schema"."table"
 * escapeAthenaIdentifier('table"with"quotes') // => "table""with""quotes"
 */
export const escapeAthenaIdentifier = createIdentifierEscaper({ quoteChar: '"' });
