import { BigQueryFieldType } from '../../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { SnowflakeFieldType } from '../../../../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { ReportDataHeader } from '../../../../dto/domain/report-data-header.dto';
import { SheetValuesFormatter } from './sheet-values-formatter';

describe('SheetValuesFormatter', () => {
  let formatter: SheetValuesFormatter;

  beforeEach(() => {
    formatter = new SheetValuesFormatter();
  });

  describe('formatRowsValuesByName', () => {
    const headersByName = new Map<string, ReportDataHeader>([
      [
        'session_id',
        new ReportDataHeader('session_id', undefined, undefined, BigQueryFieldType.STRING),
      ],
      ['clicks', new ReportDataHeader('clicks', undefined, undefined, BigQueryFieldType.INTEGER)],
    ]);
    const finalNames = ['session_id', 'clicks'];

    it('prefixes values starting with + with an apostrophe', () => {
      const rows = [['+Dri7CMMPMBcFIRWcd8RP3AAIi0eVSDWK0PB7RnFQIc=', 42]];

      const result = formatter.formatRowsValuesByName(rows, finalNames, headersByName, 'UTC');

      expect(result).toEqual([["'+Dri7CMMPMBcFIRWcd8RP3AAIi0eVSDWK0PB7RnFQIc=", 42]]);
    });

    it('escapes + values in columns without a registered type formatter', () => {
      const rows = [['+380501234567', '+1']];
      const names = ['phone', 'delta'];

      const result = formatter.formatRowsValuesByName(rows, names, new Map(), 'UTC');

      expect(result).toEqual([["'+380501234567", "'+1"]]);
    });

    it('leaves values starting with = untouched so formulas can be inserted as data', () => {
      const rows = [['=SUM(A1:A2)', 1]];

      const result = formatter.formatRowsValuesByName(rows, finalNames, headersByName, 'UTC');

      expect(result).toEqual([['=SUM(A1:A2)', 1]]);
    });

    it('leaves non-string values and strings without leading + untouched', () => {
      const rows = [
        ['plain text', 0],
        ['a+b', -5],
        [null, undefined],
        [true, 3.14],
      ];

      const result = formatter.formatRowsValuesByName(rows, finalNames, headersByName, 'UTC');

      expect(result).toEqual([
        ['plain text', 0],
        ['a+b', -5],
        [null, undefined],
        [true, 3.14],
      ]);
    });

    it('keeps record and joined-array JSON text unchanged alongside scalar descendants', () => {
      const names = ['customer', 'customer.country', 'customer.city', 'order_details__tags'];
      const headers = new Map<string, ReportDataHeader>([
        [
          'customer',
          new ReportDataHeader('customer', undefined, undefined, BigQueryFieldType.RECORD),
        ],
      ]);
      const rows = [['{"country":"UA","city":"Kyiv"}', 'UA', 'Kyiv', '[["a","b"],["c"]]']];

      const result = formatter.formatRowsValuesByName(rows, names, headers, 'UTC');

      expect(result).toEqual(rows);
    });

    it('does not double-encode JSON text when storage type metadata is absent', () => {
      const rows = [
        [
          '{"nested":{"active":true},"tags":["a"],"missing":null}',
          '[{"sku":"A","quantity":2}]',
          '[]',
        ],
      ];

      const result = formatter.formatRowsValuesByName(
        rows,
        ['record', 'items', 'empty'],
        new Map(),
        'UTC'
      );

      expect(result).toEqual(rows);
    });

    it('preserves Date values from storage readers without adding JSON quotes', () => {
      const timestamp = new Date('2026-01-02T03:04:05.000Z');
      const headers = new Map<string, ReportDataHeader>([
        ['ts', new ReportDataHeader('ts', undefined, undefined, SnowflakeFieldType.TIMESTAMP)],
      ]);

      const result = formatter.formatRowsValuesByName([[timestamp]], ['ts'], headers, 'UTC');

      expect(result[0][0]).toBe(timestamp);
      expect(JSON.parse(JSON.stringify({ values: result }))).toEqual({
        values: [['2026-01-02T03:04:05.000Z']],
      });
    });

    it('still applies the timestamp formatter alongside + escaping', () => {
      const timestampHeaders = new Map<string, ReportDataHeader>([
        ['ts', new ReportDataHeader('ts', undefined, undefined, BigQueryFieldType.TIMESTAMP)],
        ['id', new ReportDataHeader('id', undefined, undefined, BigQueryFieldType.STRING)],
      ]);
      const rows = [['2026-01-02T03:04:05Z', '+abc']];

      const result = formatter.formatRowsValuesByName(rows, ['ts', 'id'], timestampHeaders, 'UTC');

      expect(result).toEqual([['2026-01-02 03:04:05', "'+abc"]]);
    });
  });

  describe('escapeRowValues', () => {
    it('escapes + values in place and returns the same row', () => {
      const row = ['+Header alias', 'plain', 42, null];

      const result = formatter.escapeRowValues(row);

      expect(result).toBe(row);
      expect(row).toEqual(["'+Header alias", 'plain', 42, null]);
    });
  });
});
