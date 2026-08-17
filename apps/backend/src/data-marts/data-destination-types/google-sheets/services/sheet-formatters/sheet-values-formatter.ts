import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AthenaFieldType } from '../../../../data-storage-types/athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from '../../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { SnowflakeFieldType } from '../../../../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { ReportDataHeader } from '../../../../dto/domain/report-data-header.dto';
import { StorageFieldType } from '../../../../dto/domain/storage-field-type';

type FormatterFunction = (value: unknown, sheetTimeZone: string) => unknown;

/**
 * Service for formatting values in Google Sheets
 * Provides methods to format values based on field types
 */
@Injectable()
export class SheetValuesFormatter {
  private readonly formatters = new Map<StorageFieldType, FormatterFunction>([
    [BigQueryFieldType.TIMESTAMP, this.formatTimestamp],
    [AthenaFieldType.TIMESTAMP, this.formatTimestamp],
    [AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE, this.formatTimestamp],
    [SnowflakeFieldType.TIMESTAMP, this.formatTimestamp],
  ]);

  /**
   * Formats values in rows based on field types, resolving the per-column
   * formatter by column **name**. Used by the diff-based writer where each
   * row has already been reordered to match the user's column layout in the
   * destination sheet, so positional alignment with the SQL output schema
   * does not hold.
   *
   * Nullish cells (SQL `NULL` → JavaScript `null`/`undefined`) pass through
   * unchanged. The writer pre-clears the imported rectangle before writing
   * data, so any cell the payload does not explicitly overwrite is already
   * empty — `null`-in-payload (which Sheets `values.update` treats as
   * "skip this cell") therefore leaves the cell in its pre-cleared state.
   *
   * @param orderedRows - Rows already reordered to align with `finalNames`
   * @param finalNames - Column names in the order they appear in the sheet
   * @param headersByName - SQL output schema indexed by column name
   * @param sheetTimeZone - Time zone of the sheet
   */
  public formatRowsValuesByName(
    orderedRows: unknown[][],
    finalNames: string[],
    headersByName: ReadonlyMap<string, ReportDataHeader>,
    sheetTimeZone: string
  ): unknown[][] {
    const columnsToFormat = finalNames
      .map((name, index) => {
        const header = headersByName.get(name);
        return {
          index,
          formatter: header ? this.formatters.get(header.storageFieldType!) : undefined,
        };
      })
      .filter(item => item.formatter);

    orderedRows.forEach(row => {
      columnsToFormat.forEach(({ index, formatter }) => {
        row[index] = formatter!(row[index], sheetTimeZone);
      });
      this.escapeRowValues(row);
    });

    return orderedRows;
  }

  /**
   * The data write uses `valueInputOption: 'USER_ENTERED'`, which makes Sheets
   * parse a leading `+` as the start of a formula and render the cell as
   * `#ERROR! Formula parse error`. A leading apostrophe is the Sheets escape
   * symbol: the cell shows the original value and the apostrophe itself is not
   * part of the cell content. Only `+` is escaped — values starting with `=`
   * intentionally stay untouched so that formulas can be inserted as data.
   *
   * Mutates the row in place and returns it. Public so that every row written
   * through `USER_ENTERED` — including the header row, where a user-defined
   * column alias may start with `+` — is escaped the same way.
   */
  public escapeRowValues<T extends unknown[]>(row: T): T {
    for (let i = 0; i < row.length; i++) {
      const value = row[i];
      if (typeof value === 'string' && value.startsWith('+')) {
        row[i] = `'${value}`;
      }
    }
    return row;
  }

  private formatTimestamp(value: unknown, sheetTimeZone: string): unknown {
    if (typeof value !== 'string' || !value) return value;

    const dateTime = DateTime.fromISO(value).isValid
      ? DateTime.fromISO(value)
      : DateTime.fromSQL(value);

    return dateTime.isValid
      ? dateTime.setZone(sheetTimeZone).toFormat('yyyy-MM-dd HH:mm:ss')
      : value;
  }
}
