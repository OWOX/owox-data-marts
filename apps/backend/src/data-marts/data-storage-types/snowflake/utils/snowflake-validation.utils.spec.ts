import {
  isValidSnowflakeFullyQualifiedName,
  isValidSnowflakeTablePattern,
} from './snowflake-validation.utils';

describe('isValidSnowflakeFullyQualifiedName', () => {
  it('should return true for valid 3-level names', () => {
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table')).toBe(true);
    expect(isValidSnowflakeFullyQualifiedName('my_db.my_schema.my_table')).toBe(true);
    expect(isValidSnowflakeFullyQualifiedName('DB_1.SCHEMA_1.TABLE_1')).toBe(true);
    expect(isValidSnowflakeFullyQualifiedName('db$schema$table')).toBe(true);
  });

  it('should return false for SQL injection attempts with double quotes', () => {
    expect(isValidSnowflakeFullyQualifiedName('db."schema"."table"')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema."table" UNION SELECT')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('"db"."schema"."table"')).toBe(false);
  });

  it('should return false for SQL injection attempts with comments', () => {
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table--')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table/*comment*/')).toBe(false);
  });

  it('should return false for SQL injection attempts with semicolon', () => {
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table; DROP')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table;DELETE')).toBe(false);
  });

  it('should return false for names with special characters', () => {
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table*')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName("db.schema.table'")).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table/')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table\\')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table`')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema.table-')).toBe(false); // hyphen not allowed in Snowflake
  });

  it('should return false for empty or invalid input', () => {
    expect(isValidSnowflakeFullyQualifiedName('')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('single')).toBe(false);
    expect(isValidSnowflakeFullyQualifiedName('db.schema')).toBe(false); // only 2 levels
    expect(isValidSnowflakeFullyQualifiedName('a.b.c.d')).toBe(false); // 4 levels
  });
});

describe('isValidSnowflakeTablePattern', () => {
  it('should return true for valid 3-level patterns', () => {
    expect(isValidSnowflakeTablePattern('db.schema.table_*')).toBe(true);
    expect(isValidSnowflakeTablePattern('my_db.my_schema.my_table_*')).toBe(true);
    expect(isValidSnowflakeTablePattern('db.schema.*')).toBe(true);
    expect(isValidSnowflakeTablePattern('db$schema$table_*')).toBe(true);
  });

  it('should return false for SQL injection attempts', () => {
    expect(isValidSnowflakeTablePattern('db.schema."table"*')).toBe(false);
    expect(isValidSnowflakeTablePattern('db.schema.table*--')).toBe(false);
    expect(isValidSnowflakeTablePattern('db.schema.table*; DROP')).toBe(false);
  });

  it('should return false for 2-level patterns (Snowflake requires 3 levels)', () => {
    expect(isValidSnowflakeTablePattern('schema.table_*')).toBe(false);
    expect(isValidSnowflakeTablePattern('schema.*')).toBe(false);
  });
});
