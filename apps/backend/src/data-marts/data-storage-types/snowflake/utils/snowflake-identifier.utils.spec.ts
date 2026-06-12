import { escapeSnowflakeIdentifier, escapeSnowflakeSchema } from './snowflake-identifier.utils';

describe('snowflake-identifier.utils', () => {
  describe('escapeSnowflakeIdentifier', () => {
    it('should quote a single identifier', () => {
      expect(escapeSnowflakeIdentifier('my_table')).toBe('"my_table"');
    });

    it('should quote schema.table format', () => {
      expect(escapeSnowflakeIdentifier('schema.table')).toBe('"schema"."table"');
    });

    it('should quote database.schema.table format (schema and table only)', () => {
      expect(escapeSnowflakeIdentifier('database.schema.table')).toBe('database."schema"."table"');
    });

    it('should not double-quote already quoted identifiers', () => {
      expect(escapeSnowflakeIdentifier('bank2."BANK"."bank_of_canada_exchange_rates"')).toBe(
        'bank2."BANK"."bank_of_canada_exchange_rates"'
      );
    });

    it('should handle partially quoted identifiers', () => {
      expect(escapeSnowflakeIdentifier('database."SCHEMA".table')).toBe(
        'database."SCHEMA"."table"'
      );
      expect(escapeSnowflakeIdentifier('database.schema."TABLE"')).toBe(
        'database."schema"."TABLE"'
      );
    });

    it('should remove quotes from database name if present', () => {
      expect(escapeSnowflakeIdentifier('"database".schema.table')).toBe(
        'database."schema"."table"'
      );
    });

    it('should handle empty string', () => {
      expect(escapeSnowflakeIdentifier('')).toBe('');
    });

    it('should handle case-sensitive identifiers', () => {
      expect(escapeSnowflakeIdentifier('database."MySchema"."MyTable"')).toBe(
        'database."MySchema"."MyTable"'
      );
    });

    it('should handle identifiers with special characters when quoted', () => {
      expect(escapeSnowflakeIdentifier('database."my-schema"."my_table"')).toBe(
        'database."my-schema"."my_table"'
      );
    });

    it('should quote a database name that is not a valid unquoted identifier', () => {
      expect(escapeSnowflakeIdentifier('my-db.schema.table')).toBe('"my-db"."schema"."table"');
      expect(escapeSnowflakeIdentifier('"my-db".schema.table')).toBe('"my-db"."schema"."table"');
    });

    it('should never pass embedded double quotes through raw', () => {
      // unpaired quote is dropped by part splitting; the output stays fully quoted
      expect(escapeSnowflakeIdentifier('col"name')).toBe('"col"."name"');
      // paired quotes inside a part are escaped by doubling
      expect(escapeSnowflakeIdentifier('"col" name')).toBe('"""col"" name"');
    });

    it('should fail closed on inputs with more than three parts', () => {
      expect(escapeSnowflakeIdentifier('a.b.c.d')).toBe('"a"."b"."c"."d"');
    });

    it('should neutralize SQL breakout attempts instead of returning them raw', () => {
      expect(escapeSnowflakeIdentifier('a.b.c.d FROM sensitive_table --')).toBe(
        '"a"."b"."c"."d FROM sensitive_table --"'
      );
      expect(escapeSnowflakeIdentifier('"x" FROM y --"')).toBe('"""x"" FROM y --"');
    });
  });

  describe('escapeSnowflakeSchema', () => {
    it('should quote schema name', () => {
      expect(escapeSnowflakeSchema('database', 'schema')).toBe('database."schema"');
    });

    it('should not double-quote already quoted schema', () => {
      expect(escapeSnowflakeSchema('database', '"SCHEMA"')).toBe('database."SCHEMA"');
    });

    it('should remove quotes from database name if present', () => {
      expect(escapeSnowflakeSchema('"database"', 'schema')).toBe('database."schema"');
    });

    it('should handle case-sensitive schema names', () => {
      expect(escapeSnowflakeSchema('database', '"MySchema"')).toBe('database."MySchema"');
    });

    it('should quote a database name that is not a valid unquoted identifier', () => {
      expect(escapeSnowflakeSchema('my-db', 'schema')).toBe('"my-db"."schema"');
    });
  });
});
