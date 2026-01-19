import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AthenaFieldType } from '../../../../data-storage-types/athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from '../../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { SnowflakeFieldType } from '../../../../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { RedshiftFieldType } from '../../../../data-storage-types/redshift/enums/redshift-field-type.enum';
import { DatabricksFieldType } from '../../../../data-storage-types/databricks/enums/databricks-field-type.enum';
import { ReportDataHeader } from '../../../../dto/domain/report-data-header.dto';

type FieldType =
  | BigQueryFieldType
  | AthenaFieldType
  | SnowflakeFieldType
  | RedshiftFieldType
  | DatabricksFieldType;
type FormatterFunction = (value: unknown, sheetTimeZone: string) => unknown;

/**
 * Service for formatting values in Google Sheets
 * Provides methods to format values based on field types
 */
@Injectable()
export class SheetValuesFormatter {
  private readonly formatters = new Map<FieldType, FormatterFunction>([
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
