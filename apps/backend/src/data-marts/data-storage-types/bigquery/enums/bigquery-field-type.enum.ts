/**
 * {@link ITableFieldSchema#type}
 */
export enum BigQueryFieldType {
  // Numeric types
  INTEGER = 'INTEGER',
  INT64 = 'INT64',
  FLOAT = 'FLOAT',
  FLOAT64 = 'FLOAT64',
  NUMERIC = 'NUMERIC',
  BIGNUMERIC = 'BIGNUMERIC',

  // String types
  STRING = 'STRING',

  // Binary types
  BYTES = 'BYTES',

  // Boolean types
  BOOLEAN = 'BOOLEAN',
  BOOL = 'BOOL',

  // Date/Time types
  DATE = 'DATE',
  TIME = 'TIME',
  DATETIME = 'DATETIME',
  TIMESTAMP = 'TIMESTAMP',

  // Geospatial types
  GEOGRAPHY = 'GEOGRAPHY',

  // Complex types
  JSON = 'JSON',
  RECORD = 'RECORD',
  STRUCT = 'STRUCT',
  RANGE = 'RANGE',
}

export function parseBigQueryFieldType(bigQueryNativeType: string): BigQueryFieldType | null {
  const normalizedType = bigQueryNativeType.toUpperCase();
  if (Object.values(BigQueryFieldType).includes(normalizedType as BigQueryFieldType)) {
    return normalizedType as BigQueryFieldType;
  }

  // // Handle special cases or aliases
  // switch (normalizedType) {
  //   case 'INT64':
  //     return BigQueryFieldType.INTEGER;
  //   case 'FLOAT64':
  //     return BigQueryFieldType.FLOAT;
  //   case 'BOOL':
  //     return BigQueryFieldType.BOOLEAN;
  //   case 'STRUCT':
  //     return BigQueryFieldType.RECORD;
  // }

  return null;
}
