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
   * Formats values in rows based on field types
   * @param rows - Rows to format
   * @param dataHeaders - Headers for the rows
   * @param sheetTimeZone - Time zone of the sheet
   * @returns Formatted rows
   */
  public formatRowsValues(
    rows: unknown[][],
    dataHeaders: ReportDataHeader[],
    sheetTimeZone: string
  ): unknown[][] {
    const columnsToFormat = dataHeaders
      .map((header, index) => ({
        index,
        formatter: this.formatters.get(header.storageFieldType!),
      }))
      .filter(item => item.formatter);

    if (columnsToFormat.length > 0) {
      rows.forEach(row => {
        columnsToFormat.forEach(({ index, formatter }) => {
          row[index] = formatter!(row[index], sheetTimeZone);
        });
      });
    }

    return rows;
  }

  /**
   * Same as {@link formatRowsValues} but resolves the per-column formatter by
   * column **name** instead of position. Used by the diff-based writer where
   * each row has already been reordered to match the user's column layout in
   * the destination sheet, so positional alignment with the SQL output schema
   * no longer holds.
   *
   * Also normalizes every cell to a concrete primitive: `null`, `undefined`,
   * and sparse-array holes collapse to `""`. The Sheets `values.update` API
   * treats those three as "skip this cell, preserve existing content", which
   * would let manual user edits bleed across refreshes inside the imported
   * rectangle. `""` explicitly clears the cell, matching the writer's
   * contract that the imported rectangle is fully owned by ODM. Other falsy
   * values (`0`, `false`, the literal empty string) pass through unchanged.
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
    const formatters = finalNames.map(name => {
      const header = headersByName.get(name);
      return header ? this.formatters.get(header.storageFieldType!) : undefined;
    });
    const width = finalNames.length;

    orderedRows.forEach(row => {
      for (let i = 0; i < width; i++) {
        const fmt = formatters[i];
        const raw = fmt ? fmt(row[i], sheetTimeZone) : row[i];
        row[i] = raw == null ? '' : raw;
      }
    });

    return orderedRows;
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
