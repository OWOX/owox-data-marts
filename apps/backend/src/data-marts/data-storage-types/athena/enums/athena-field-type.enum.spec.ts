import { AthenaFieldType, parseAthenaFieldType } from './athena-field-type.enum';

describe('parseAthenaFieldType', () => {
  describe('exact base types', () => {
    it.each([
      ['boolean', AthenaFieldType.BOOLEAN],
      ['integer', AthenaFieldType.INTEGER],
      ['bigint', AthenaFieldType.BIGINT],
      ['double', AthenaFieldType.DOUBLE],
      ['real', AthenaFieldType.REAL],
      ['decimal', AthenaFieldType.DECIMAL],
      ['varchar', AthenaFieldType.VARCHAR],
      ['char', AthenaFieldType.CHAR],
      ['date', AthenaFieldType.DATE],
      ['timestamp', AthenaFieldType.TIMESTAMP],
    ])('maps "%s" -> %s', (input, expected) => {
      expect(parseAthenaFieldType(input)).toBe(expected);
    });

    it('is case-insensitive', () => {
      expect(parseAthenaFieldType('VARCHAR')).toBe(AthenaFieldType.VARCHAR);
      expect(parseAthenaFieldType('VarChar')).toBe(AthenaFieldType.VARCHAR);
    });
  });

  // The core M1 regression: parameterized spellings must resolve to their base
  // type so numeric/date operators stay valid. Before normalization these fell
  // through to STRING, which wrongly rejected between/gt on real decimal columns.
  describe('parameterized scalar types (precision/scale/length)', () => {
    it.each([
      ['decimal(10,2)', AthenaFieldType.DECIMAL],
      ['decimal(38, 0)', AthenaFieldType.DECIMAL],
      ['varchar(255)', AthenaFieldType.VARCHAR],
      ['char(3)', AthenaFieldType.CHAR],
      ['timestamp(3)', AthenaFieldType.TIMESTAMP],
      ['time(6)', AthenaFieldType.TIME],
    ])('strips args: "%s" -> %s', (input, expected) => {
      expect(parseAthenaFieldType(input)).toBe(expected);
    });

    it('keeps the "with time zone" suffix after stripping precision', () => {
      expect(parseAthenaFieldType('timestamp(3) with time zone')).toBe(
        AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE
      );
      expect(parseAthenaFieldType('time(6) with time zone')).toBe(
        AthenaFieldType.TIME_WITH_TIME_ZONE
      );
    });
  });

  describe('zoned/interval temporal types', () => {
    it.each([
      ['timestamp with time zone', AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE],
      ['time with time zone', AthenaFieldType.TIME_WITH_TIME_ZONE],
      ['interval year to month', AthenaFieldType.INTERVAL_YEAR_TO_MONTH],
      ['interval day to second', AthenaFieldType.INTERVAL_DAY_TO_SECOND],
    ])('maps "%s" -> %s', (input, expected) => {
      expect(parseAthenaFieldType(input)).toBe(expected);
    });
  });

  // Complex types must classify by head, not fall back to STRING — otherwise the
  // validator would treat them as filterable strings instead of fail-closed.
  describe('complex types (Hive <> and Trino () spellings)', () => {
    it.each([
      ['array<integer>', AthenaFieldType.ARRAY],
      ['array(integer)', AthenaFieldType.ARRAY],
      ['map<varchar,integer>', AthenaFieldType.MAP],
      ['map(varchar, integer)', AthenaFieldType.MAP],
      ['map(varchar(255), integer)', AthenaFieldType.MAP],
      ['struct<a:int,b:string>', AthenaFieldType.STRUCT],
      ['row(x integer, y varchar(10))', AthenaFieldType.ROW],
    ])('maps "%s" -> %s', (input, expected) => {
      expect(parseAthenaFieldType(input)).toBe(expected);
    });
  });

  describe('unsupported / unknown types', () => {
    it.each([
      ['', null],
      ['some_unknown_type', null],
      ['geometry', null],
    ])('returns null for "%s"', (input, expected) => {
      expect(parseAthenaFieldType(input)).toBe(expected);
    });
  });
});
