/**
 * Utility functions for escaping Databricks identifiers to prevent SQL injection
 *
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Naming Rules
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

const escapeDatabricksIdentifier = createIdentifierEscaper({ quoteChar: '`' });

/**
 * Escapes a fully qualified Databricks identifier (catalog.schema.table)
 * @param parts - Array of identifier parts [catalog, schema, table] or [schema, table] or [table]
 * @returns Escaped fully qualified identifier
 */
export function escapeFullyQualifiedIdentifier(parts: string[]): string {
  return escapeDatabricksIdentifier(parts.join('.'));
}
