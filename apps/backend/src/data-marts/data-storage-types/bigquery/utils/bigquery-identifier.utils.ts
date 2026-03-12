/**
 * Escaping BigQuery identifiers to prevent SQL injection
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical#quoted_identifiers} BigQuery Quoted Identifiers
 */

import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

/**
 * @example
 * escapeBigQueryIdentifier('my_table') // => `my_table`
 * escapeBigQueryIdentifier('dataset.table') // => `dataset`.`table`
 * escapeBigQueryIdentifier('project.dataset.table') // => `project`.`dataset`.`table`
 * escapeBigQueryIdentifier('table`with`backticks') // => `table``with``backticks`
 */
export const escapeBigQueryIdentifier = createIdentifierEscaper({ quoteChar: '`' });
