import { areTypesCompatible, isPrimitiveFieldType } from './field-type-compatibility';

describe('isPrimitiveFieldType', () => {
  it.each([
    ['RECORD'],
    ['STRUCT'],
    ['JSON'],
    ['RANGE'],
    ['INTERVAL'],
    ['VARIANT'],
    ['OBJECT'],
    ['ARRAY'],
    ['MAP'],
    ['ROW'],
    ['SUPER'],
  ])('returns false for complex type %s', type => {
    expect(isPrimitiveFieldType(type)).toBe(false);
  });

  it.each([
    ['STRING'],
    ['INTEGER'],
    ['INT64'],
    ['FLOAT'],
    ['FLOAT64'],
    ['BOOLEAN'],
    ['BOOL'],
    ['DATE'],
    ['TIMESTAMP'],
    ['BYTES'],
    ['NUMERIC'],
    ['DECIMAL'],
    ['VARCHAR'],
  ])('returns true for primitive type %s', type => {
    expect(isPrimitiveFieldType(type)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPrimitiveFieldType('record')).toBe(false);
    expect(isPrimitiveFieldType('string')).toBe(true);
    expect(isPrimitiveFieldType('Array')).toBe(false);
  });
});

describe('areTypesCompatible', () => {
  describe('identical types', () => {
    it('returns true for the same type', () => {
      expect(areTypesCompatible('STRING', 'STRING')).toBe(true);
      expect(areTypesCompatible('INTEGER', 'INTEGER')).toBe(true);
    });

    it('is case-insensitive for identical types', () => {
      expect(areTypesCompatible('string', 'STRING')).toBe(true);
    });
  });

  describe('numeric group', () => {
    it('returns true for INTEGER and FLOAT', () => {
      expect(areTypesCompatible('INTEGER', 'FLOAT')).toBe(true);
    });

    it('returns true for INT64 and BIGINT', () => {
      expect(areTypesCompatible('INT64', 'BIGINT')).toBe(true);
    });

    it('returns true for NUMERIC and DECIMAL', () => {
      expect(areTypesCompatible('NUMERIC', 'DECIMAL')).toBe(true);
    });

    it('returns true for FLOAT64 and DOUBLE', () => {
      expect(areTypesCompatible('FLOAT64', 'DOUBLE')).toBe(true);
    });

    it('returns true for BIGNUMERIC and NUMBER', () => {
      expect(areTypesCompatible('BIGNUMERIC', 'NUMBER')).toBe(true);
    });
  });

  describe('string group', () => {
    it('returns true for STRING and VARCHAR', () => {
      expect(areTypesCompatible('STRING', 'VARCHAR')).toBe(true);
    });

    it('returns true for CHAR and NCHAR', () => {
      expect(areTypesCompatible('CHAR', 'NCHAR')).toBe(true);
    });

    it('returns true for TEXT and NVARCHAR', () => {
      expect(areTypesCompatible('TEXT', 'NVARCHAR')).toBe(true);
    });
  });

  describe('boolean group', () => {
    it('returns true for BOOLEAN and BOOL', () => {
      expect(areTypesCompatible('BOOLEAN', 'BOOL')).toBe(true);
    });
  });

  describe('date/time group', () => {
    it('returns true for TIMESTAMP and TIMESTAMPTZ', () => {
      expect(areTypesCompatible('TIMESTAMP', 'TIMESTAMPTZ')).toBe(true);
    });

    it('returns true for DATETIME and TIMESTAMP_NTZ', () => {
      expect(areTypesCompatible('DATETIME', 'TIMESTAMP_NTZ')).toBe(true);
    });

    it('returns true for DATE and TIMESTAMP', () => {
      expect(areTypesCompatible('DATE', 'TIMESTAMP')).toBe(true);
    });
  });

  describe('binary group', () => {
    it('returns true for BYTES and BYTEA', () => {
      expect(areTypesCompatible('BYTES', 'BYTEA')).toBe(true);
    });

    it('returns true for BINARY and VARBINARY', () => {
      expect(areTypesCompatible('BINARY', 'VARBINARY')).toBe(true);
    });
  });

  describe('incompatible types across groups', () => {
    it('returns false for STRING and INTEGER', () => {
      expect(areTypesCompatible('STRING', 'INTEGER')).toBe(false);
    });

    it('returns false for BOOLEAN and DATE', () => {
      expect(areTypesCompatible('BOOLEAN', 'DATE')).toBe(false);
    });

    it('returns false for BYTES and FLOAT', () => {
      expect(areTypesCompatible('BYTES', 'FLOAT')).toBe(false);
    });

    it('returns false for VARCHAR and TIMESTAMP', () => {
      expect(areTypesCompatible('VARCHAR', 'TIMESTAMP')).toBe(false);
    });
  });
});
