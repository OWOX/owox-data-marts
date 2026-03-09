import {
  isValidAthenaFullyQualifiedName,
  isValidAthenaTablePattern,
} from './athena-validation.utils';

describe('isValidAthenaFullyQualifiedName', () => {
  it('should return true for valid 2-level names', () => {
    expect(isValidAthenaFullyQualifiedName('database.table')).toBe(true);
    expect(isValidAthenaFullyQualifiedName('my_database.my_table')).toBe(true);
    expect(isValidAthenaFullyQualifiedName('database-1.table-1')).toBe(true);
  });

  it('should return true for valid 3-level names', () => {
    expect(isValidAthenaFullyQualifiedName('catalog.database.table')).toBe(true);
    expect(isValidAthenaFullyQualifiedName('my_catalog.my_database.my_table')).toBe(true);
    expect(isValidAthenaFullyQualifiedName('catalog-1.database-1.table-1')).toBe(true);
  });

  it('should return false for SQL injection attempts with double quotes', () => {
    expect(isValidAthenaFullyQualifiedName('database."table"')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table" UNION SELECT')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('"database"."table"')).toBe(false);
  });

  it('should return false for SQL injection attempts with comments', () => {
    expect(isValidAthenaFullyQualifiedName('database.table--')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table/*comment*/')).toBe(false);
  });

  it('should return false for SQL injection attempts with semicolon', () => {
    expect(isValidAthenaFullyQualifiedName('database.table; DROP')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table;DELETE')).toBe(false);
  });

  it('should return false for names with special characters', () => {
    expect(isValidAthenaFullyQualifiedName('database.table*')).toBe(false);
    expect(isValidAthenaFullyQualifiedName("database.table'")).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table/')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table\\')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table`')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('database.table$')).toBe(false); // dollar not allowed in Athena
  });

  it('should return false for empty or invalid input', () => {
    expect(isValidAthenaFullyQualifiedName('')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('single')).toBe(false);
    expect(isValidAthenaFullyQualifiedName('a.b.c.d')).toBe(false); // 4 levels
  });
});

describe('isValidAthenaTablePattern', () => {
  it('should return true for valid 2-level patterns', () => {
    expect(isValidAthenaTablePattern('database.table_*')).toBe(true);
    expect(isValidAthenaTablePattern('my_database.my_table_*')).toBe(true);
    expect(isValidAthenaTablePattern('database.*')).toBe(true);
  });

  it('should return true for valid 3-level patterns', () => {
    expect(isValidAthenaTablePattern('catalog.database.table_*')).toBe(true);
    expect(isValidAthenaTablePattern('my_catalog.my_database.my_table_*')).toBe(true);
    expect(isValidAthenaTablePattern('catalog.database.*')).toBe(true);
  });

  it('should return false for SQL injection attempts', () => {
    expect(isValidAthenaTablePattern('database."table"*')).toBe(false);
    expect(isValidAthenaTablePattern('database.table*--')).toBe(false);
    expect(isValidAthenaTablePattern('database.table*; DROP')).toBe(false);
    expect(isValidAthenaTablePattern('database.table"*')).toBe(false);
  });
});
