export enum DataQualityCategory {
  PK_UNIQUENESS = 'pk_uniqueness',
  DUPLICATE_ROWS = 'duplicate_rows',
  NULL_RATE = 'null_rate',
  COLUMN_UNIQUENESS = 'column_uniqueness',
  CONSTANT_COLUMN = 'constant_column',
  EMPTY_TABLE = 'empty_table',
  TYPE_MISMATCH = 'type_mismatch',
  DATA_FRESHNESS = 'data_freshness',
  FUTURE_VALUES = 'future_values',
  NEGATIVE_VALUES = 'negative_values',
  RELATIONSHIP_INTEGRITY = 'relationship_integrity',
  REVERSE_RELATIONSHIP = 'reverse_relationship',
}
