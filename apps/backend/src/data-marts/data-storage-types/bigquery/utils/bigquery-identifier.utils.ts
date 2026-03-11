/**
 * Utility functions for escaping BigQuery identifiers to prevent SQL injection
 *
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical#quoted_identifiers} BigQuery Quoted Identifiers
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

/**
 * Escapes BigQuery identifiers by properly handling quoted and unquoted parts.
 * Splits the identifier by dots, preserving quoted sections.
 *
 * @param identifier - Can be a single identifier or a fully qualified name (e.g., "project.dataset.table")
 * @returns Escaped identifier with all parts properly quoted and internal backticks escaped
 *
 * @example
 * escapeBigQueryIdentifier('my_table') // => `my_table`
 * escapeBigQueryIdentifier('dataset.table') // => `dataset`.`table`
 * escapeBigQueryIdentifier('project.dataset.table') // => `project`.`dataset`.`table`
 * escapeBigQueryIdentifier('table`with`backticks') // => `table``with``backticks`
 */
export const escapeBigQueryIdentifier = createIdentifierEscaper({ quoteChar: '`' });
