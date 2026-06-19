import { describe, it, expect } from 'vitest';
import {
  operatorsForType,
  isFilterableType,
  isNumberType,
  isDateType,
  isTimeType,
} from './output-controls-operators';

const opValues = (type: string) => operatorsForType(type).map(o => o.value);

describe('isNumberType / isDateType (shared with FilterValueEditor parsing)', () => {
  it('treats BigQuery + Athena numeric types as numbers', () => {
    for (const t of [
      'INTEGER',
      'FLOAT',
      'NUMERIC',
      'BIGNUMERIC',
      'BIGINT',
      'SMALLINT',
      'TINYINT',
      'REAL',
      'DOUBLE',
      'DECIMAL',
    ]) {
      expect(isNumberType(t)).toBe(true);
    }
  });
  it('does not treat string/date/bool types as numbers', () => {
    for (const t of ['VARCHAR', 'STRING', 'TIMESTAMP', 'DATE', 'BOOLEAN', 'BOOL']) {
      expect(isNumberType(t)).toBe(false);
    }
  });
  it('treats calendar date/timestamp types (incl. zoned) as dates, not time-only', () => {
    for (const t of ['DATE', 'DATETIME', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE']) {
      expect(isDateType(t)).toBe(true);
      expect(isTimeType(t)).toBe(false);
    }
  });

  it('treats time-of-day types as time, not date', () => {
    for (const t of ['TIME', 'TIME WITH TIME ZONE']) {
      expect(isTimeType(t)).toBe(true);
      expect(isDateType(t)).toBe(false);
    }
  });
});

describe('operatorsForType', () => {
  describe('BigQuery type names', () => {
    it('maps STRING to the string operator set', () => {
      expect(opValues('STRING')).toContain('contains');
    });
    it('maps INTEGER / FLOAT / NUMERIC / BIGNUMERIC to the number set', () => {
      for (const t of ['INTEGER', 'FLOAT', 'NUMERIC', 'BIGNUMERIC']) {
        expect(opValues(t)).toContain('between');
        expect(opValues(t)).not.toContain('contains');
      }
    });
    it('maps DATE / DATETIME / TIMESTAMP to the date set (with relative_date)', () => {
      for (const t of ['DATE', 'DATETIME', 'TIMESTAMP']) {
        expect(opValues(t)).toContain('relative_date');
      }
    });

    it('maps TIME to the time set: comparison ops but NOT relative_date', () => {
      expect(opValues('TIME')).toContain('between');
      expect(opValues('TIME')).not.toContain('relative_date');
    });
    it('maps BOOLEAN to the boolean set', () => {
      expect(opValues('BOOLEAN')).toContain('is_true');
    });
  });

  // Regression: the FE advertised Athena output controls but its type matrix only
  // recognised BigQuery type names, so normal Athena columns were unfilterable.
  describe('Athena type names', () => {
    it('treats VARCHAR / CHAR as string types', () => {
      for (const t of ['VARCHAR', 'CHAR']) {
        expect(opValues(t)).toContain('contains');
        expect(isFilterableType(t)).toBe(true);
      }
    });
    it('treats BIGINT / SMALLINT / TINYINT / REAL / DOUBLE / DECIMAL as number types', () => {
      for (const t of ['BIGINT', 'SMALLINT', 'TINYINT', 'REAL', 'DOUBLE', 'DECIMAL']) {
        expect(opValues(t)).toContain('between');
        expect(opValues(t)).not.toContain('contains');
      }
    });
    it('treats zoned TIMESTAMP as a date type (relative_date offered)', () => {
      expect(opValues('TIMESTAMP WITH TIME ZONE')).toContain('relative_date');
    });

    // Regression: a time-of-day column must not offer relative_date — its presets
    // resolve to calendar dates (current_date), which Trino rejects for TIME.
    it('treats zoned TIME as a time type (relative_date withheld)', () => {
      expect(opValues('TIME WITH TIME ZONE')).toContain('between');
      expect(opValues('TIME WITH TIME ZONE')).not.toContain('relative_date');
    });
    it('treats BOOL as a boolean type', () => {
      expect(opValues('BOOL')).toContain('is_true');
    });
  });

  describe('Redshift type names', () => {
    it('maps Redshift TEXT/BPCHAR to string ops', () => {
      for (const t of ['TEXT', 'BPCHAR']) expect(opValues(t)).toContain('contains');
    });
    it('maps DOUBLE PRECISION to number ops', () => {
      expect(opValues('DOUBLE PRECISION')).toContain('between');
    });
    it('maps TIMESTAMPTZ to date ops with relative_date', () => {
      expect(opValues('TIMESTAMPTZ')).toContain('relative_date');
    });
    it('maps TIMETZ to time ops without relative_date', () => {
      expect(opValues('TIMETZ')).toContain('between');
      expect(opValues('TIMETZ')).not.toContain('relative_date');
    });
  });

  // Databricks emits INT (not INTEGER) and TIMESTAMP_NTZ, and has no standalone TIME type.
  describe('Databricks type names', () => {
    it('maps INT to number ops (comparison + between, no relative_date)', () => {
      expect(opValues('INT')).toContain('between');
      expect(opValues('INT')).not.toContain('relative_date');
      expect(isNumberType('INT')).toBe(true);
    });
    it('maps TIMESTAMP_NTZ to date ops with relative_date', () => {
      expect(opValues('TIMESTAMP_NTZ')).toContain('relative_date');
      expect(isDateType('TIMESTAMP_NTZ')).toBe(true);
    });
  });

  it('returns no operators for unrecognised (complex/binary) types', () => {
    for (const t of ['ARRAY', 'MAP', 'STRUCT', 'JSON', 'VARBINARY', 'GEOGRAPHY']) {
      expect(operatorsForType(t)).toEqual([]);
      expect(isFilterableType(t)).toBe(false);
    }
  });
});
