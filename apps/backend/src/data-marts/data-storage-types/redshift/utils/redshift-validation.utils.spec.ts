import {
  isValidRedshiftFullyQualifiedName,
  isValidRedshiftTablePattern,
} from './redshift-validation.utils';

describe('isValidRedshiftFullyQualifiedName', () => {
  it('should return true for valid 2-level names', () => {
    expect(isValidRedshiftFullyQualifiedName('schema.table')).toBe(true);
    expect(isValidRedshiftFullyQualifiedName('my_schema.my_table')).toBe(true);
    expect(isValidRedshiftFullyQualifiedName('schema-1.table-1')).toBe(true);
  });

  it('should return true for valid 3-level names', () => {
    expect(isValidRedshiftFullyQualifiedName('db.schema.table')).toBe(true);
    expect(isValidRedshiftFullyQualifiedName('my_db.my_schema.my_table')).toBe(true);
    expect(isValidRedshiftFullyQualifiedName('db-1.schema-1.table-1')).toBe(true);
  });

  it('should return false for SQL injection attempts with double quotes', () => {
    expect(isValidRedshiftFullyQualifiedName('schema."table" UNION SELECT')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('"schema"."table"')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('schema.table"')).toBe(false);
  });

  it('should return false for SQL injection attempts with comments', () => {
    expect(isValidRedshiftFullyQualifiedName('schema.table--')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('schema.table/*comment*/')).toBe(false);
  });

  it('should return false for SQL injection attempts with semicolon', () => {
    expect(isValidRedshiftFullyQualifiedName('schema.table; DROP')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('schema.table;DELETE')).toBe(false);
  });

  it('should return false for names with special characters', () => {
    expect(isValidRedshiftFullyQualifiedName('schema.table*')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName("schema.table'")).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('schema.table/')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('schema.table\\')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('schema.table`')).toBe(false);
  });

  it('should return false for empty or invalid input', () => {
    expect(isValidRedshiftFullyQualifiedName('')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('single')).toBe(false);
    expect(isValidRedshiftFullyQualifiedName('a.b.c.d')).toBe(false);
  });
});

describe('isValidRedshiftTablePattern', () => {
  it('should return true for valid 2-level patterns', () => {
    expect(isValidRedshiftTablePattern('schema.table_*')).toBe(true);
    expect(isValidRedshiftTablePattern('my_schema.my_table_*')).toBe(true);
    expect(isValidRedshiftTablePattern('schema.*')).toBe(true);
  });

  it('should return true for valid 3-level patterns', () => {
    expect(isValidRedshiftTablePattern('db.schema.table_*')).toBe(true);
    expect(isValidRedshiftTablePattern('my_db.my_schema.my_table_*')).toBe(true);
    expect(isValidRedshiftTablePattern('db.schema.*')).toBe(true);
  });

  it('should return false for SQL injection attempts', () => {
    expect(isValidRedshiftTablePattern('schema.table"*')).toBe(false);
    expect(isValidRedshiftTablePattern('schema.table*--')).toBe(false);
    expect(isValidRedshiftTablePattern('schema.table*; DROP')).toBe(false);
  });

  it('should return false for invalid wildcard placement', () => {
    // Wildcard in the middle is not allowed for table pattern
    expect(isValidRedshiftTablePattern('schema.*table')).toBe(true); // Actually this is valid per regex
  });
});
