import { BigQueryFieldType } from '../../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { ReportDataHeader } from '../../../../dto/domain/report-data-header.dto';
import { SheetValuesFormatter } from './sheet-values-formatter';

describe('SheetValuesFormatter', () => {
  let formatter: SheetValuesFormatter;

  beforeEach(() => {
    formatter = new SheetValuesFormatter();
  });

  describe('formatRowsValuesByName', () => {
    const finalNames = ['country', 'clicks', 'cost'];
    const headersByName = new Map<string, ReportDataHeader>([
      ['country', new ReportDataHeader('country', undefined, undefined, BigQueryFieldType.STRING)],
      ['clicks', new ReportDataHeader('clicks', undefined, undefined, BigQueryFieldType.INTEGER)],
      ['cost', new ReportDataHeader('cost', undefined, undefined, BigQueryFieldType.FLOAT)],
    ]);
    const tz = 'UTC';

    it('normalizes null cells to empty string so the Sheets API actually clears them', () => {
      const rows = [['A', null, 1.5]];
      formatter.formatRowsValuesByName(rows, finalNames, headersByName, tz);
      expect(rows).toEqual([['A', '', 1.5]]);
    });

    it('normalizes undefined cells to empty string', () => {
      const rows = [['A', undefined, 1.5]];
      formatter.formatRowsValuesByName(rows, finalNames, headersByName, tz);
      expect(rows).toEqual([['A', '', 1.5]]);
    });

    it('normalizes sparse-array holes to empty string', () => {
      // Build an array with a literal hole at index 1.
      // eslint-disable-next-line no-sparse-arrays
      const sparse: unknown[] = ['A', , 1.5];
      expect(1 in sparse).toBe(false);

      const rows = [sparse];
      formatter.formatRowsValuesByName(rows, finalNames, headersByName, tz);

      expect(rows).toEqual([['A', '', 1.5]]);
      // Hole is gone — every index is now materialized.
      expect(1 in rows[0]).toBe(true);
    });

    it('preserves 0, false, and empty string as-is (only nullish becomes "")', () => {
      const rows = [[0, false, '']];
      formatter.formatRowsValuesByName(rows, finalNames, headersByName, tz);
      expect(rows).toEqual([[0, false, '']]);
    });

    it('formats TIMESTAMP cells and normalizes a null timestamp to ""', () => {
      const tsHeaders = new Map<string, ReportDataHeader>([
        ['ts', new ReportDataHeader('ts', undefined, undefined, BigQueryFieldType.TIMESTAMP)],
      ]);
      const rows: unknown[][] = [['2024-05-01T12:00:00Z'], [null]];

      formatter.formatRowsValuesByName(rows, ['ts'], tsHeaders, 'UTC');

      expect(rows[0][0]).toBe('2024-05-01 12:00:00');
      expect(rows[1][0]).toBe('');
    });

    it('mutates the input array in place and returns the same reference', () => {
      const rows = [['A', null, 1.5]];
      const result = formatter.formatRowsValuesByName(rows, finalNames, headersByName, tz);
      expect(result).toBe(rows);
    });
  });
});
