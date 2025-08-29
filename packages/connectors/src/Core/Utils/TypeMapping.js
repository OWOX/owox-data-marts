/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Universal type mapping for different storage systems
 */

var TYPE_CONVERTER = {
  // Integer types
  'integer': { bigquery: 'INTEGER', athena: 'bigint' },
  'int32': { bigquery: 'INTEGER', athena: 'int' },
  'int64': { bigquery: 'INTEGER', athena: 'bigint' },
  'unsigned int32': { bigquery: 'INTEGER', athena: 'int' },
  'long': { bigquery: 'INTEGER', athena: 'bigint' },
  
  // Float types
  'float': { bigquery: 'FLOAT64', athena: 'double' },
  'number': { bigquery: 'FLOAT64', athena: 'double' },
  'double': { bigquery: 'FLOAT64', athena: 'double' },
  'decimal': { bigquery: 'NUMERIC', athena: 'decimal' },
  
  // Boolean types
  'bool': { bigquery: 'BOOL', athena: 'boolean' },
  'boolean': { bigquery: 'BOOL', athena: 'boolean' },
  
  // Date/time types
  'datetime': { bigquery: 'DATETIME', athena: 'timestamp' },
  'date': { bigquery: 'DATE', athena: 'date' },
  'timestamp': { bigquery: 'TIMESTAMP', athena: 'timestamp' }
};
