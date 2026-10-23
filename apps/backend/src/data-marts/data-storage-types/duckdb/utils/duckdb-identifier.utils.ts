/**
 * Escaping DuckDB identifiers to prevent SQL injection
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

/**
 * @example
 * escapeDuckDbIdentifier('my_table') // => "my_table"
 * escapeDuckDbIdentifier('schema.table') // => "schema"."table"
 * escapeDuckDbIdentifier('table"with"quotes') // => "table""with""quotes"
 */
export const escapeDuckDbIdentifier = createIdentifierEscaper({ quoteChar: '"' });
