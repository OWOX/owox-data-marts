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

/**
 * A query job reads `dataset.table` in its own project, and an OWOX Storage runs its jobs in another
 * project than its datasets: a two-part name gets the storage's project. The project is quoted,
 * because a domain-scoped project id (`example.com:project`) has a dot.
 *
 * @example
 * qualifyBigQueryTableName('ds.table', 'storage-project') // => '`storage-project`.ds.table'
 * qualifyBigQueryTableName('project.ds.table', 'storage-project') // => 'project.ds.table'
 */
export function qualifyBigQueryTableName(name: string, projectId: string | undefined): string {
  return projectId && name.split('.').length === 2 ? `\`${projectId}\`.${name}` : name;
}
