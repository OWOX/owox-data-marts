import {
  isValidDatabricksFullyQualifiedName,
  isValidDatabricksTablePattern,
} from './databricks-validation.utils';

describe('isValidDatabricksFullyQualifiedName', () => {
  it('should return true for valid 3-level names', () => {
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table')).toBe(true);
    expect(isValidDatabricksFullyQualifiedName('my_catalog.my_schema.my_table')).toBe(true);
    expect(isValidDatabricksFullyQualifiedName('catalog_1.schema_1.table_1')).toBe(true);
  });

  it('should return false for SQL injection attempts with backticks', () => {
    expect(isValidDatabricksFullyQualifiedName('`catalog`.`schema`.`table`')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.`table`')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table`')).toBe(false);
  });

  it('should return false for SQL injection attempts with double quotes', () => {
    expect(isValidDatabricksFullyQualifiedName('catalog."schema"."table"')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema."table" UNION SELECT')).toBe(false);
  });

  it('should return false for SQL injection attempts with comments', () => {
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table--')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table/*comment*/')).toBe(false);
  });

  it('should return false for SQL injection attempts with semicolon', () => {
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table; DROP')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table;DELETE')).toBe(false);
  });

  it('should return false for names with special characters', () => {
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table*')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName("catalog.schema.table'")).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table/')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table\\')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table-')).toBe(false); // hyphen not allowed
    expect(isValidDatabricksFullyQualifiedName('catalog.schema.table$')).toBe(false); // dollar not allowed
  });

  it('should return false for empty or invalid input', () => {
    expect(isValidDatabricksFullyQualifiedName('')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('single')).toBe(false);
    expect(isValidDatabricksFullyQualifiedName('catalog.schema')).toBe(false); // only 2 levels
    expect(isValidDatabricksFullyQualifiedName('a.b.c.d')).toBe(false); // 4 levels
  });
});

describe('isValidDatabricksTablePattern', () => {
  it('should return true for valid 3-level patterns', () => {
    expect(isValidDatabricksTablePattern('catalog.schema.table_*')).toBe(true);
    expect(isValidDatabricksTablePattern('my_catalog.my_schema.my_table_*')).toBe(true);
    expect(isValidDatabricksTablePattern('catalog.schema.*')).toBe(true);
  });

  it('should return false for SQL injection attempts with backticks', () => {
    expect(isValidDatabricksTablePattern('catalog.schema.`table`*')).toBe(false);
    expect(isValidDatabricksTablePattern('`catalog`.schema.table_*')).toBe(false);
  });

  it('should return false for SQL injection attempts with other special chars', () => {
    expect(isValidDatabricksTablePattern('catalog.schema.table*--')).toBe(false);
    expect(isValidDatabricksTablePattern('catalog.schema.table*; DROP')).toBe(false);
    expect(isValidDatabricksTablePattern('catalog.schema."table"*')).toBe(false);
  });

  it('should return false for 2-level patterns (Databricks requires 3 levels)', () => {
    expect(isValidDatabricksTablePattern('schema.table_*')).toBe(false);
    expect(isValidDatabricksTablePattern('schema.*')).toBe(false);
  });
});
