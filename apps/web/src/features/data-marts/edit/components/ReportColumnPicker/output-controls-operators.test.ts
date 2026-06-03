import { describe, it, expect } from 'vitest';
import {
  operatorsForType,
  isFilterableType,
  isNumberType,
  isDateType,
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
  it('treats date/time types (incl. zoned) as dates', () => {
    for (const t of [
      'DATE',
      'DATETIME',
      'TIME',
      'TIMESTAMP',
      'TIMESTAMP WITH TIME ZONE',
      'TIME WITH TIME ZONE',
    ]) {
      expect(isDateType(t)).toBe(true);
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
    it('maps DATE / DATETIME / TIMESTAMP / TIME to the date set', () => {
      for (const t of ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME']) {
        expect(opValues(t)).toContain('relative_date');
      }
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
    it('treats zoned timestamps as date types', () => {
      for (const t of ['TIMESTAMP WITH TIME ZONE', 'TIME WITH TIME ZONE']) {
        expect(opValues(t)).toContain('relative_date');
      }
    });
    it('treats BOOL as a boolean type', () => {
      expect(opValues('BOOL')).toContain('is_true');
    });
  });

  it('returns no operators for unrecognised (complex/binary) types', () => {
    for (const t of ['ARRAY', 'MAP', 'STRUCT', 'JSON', 'VARBINARY', 'GEOGRAPHY']) {
      expect(operatorsForType(t)).toEqual([]);
      expect(isFilterableType(t)).toBe(false);
    }
  });
});
