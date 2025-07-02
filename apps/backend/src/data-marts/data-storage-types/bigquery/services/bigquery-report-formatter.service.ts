import { Injectable } from '@nestjs/common';
import { TableField, TableRow, TableSchema } from '@google-cloud/bigquery';

/**
 * Service for formatting BigQuery report data
 */
@Injectable()
export class BigQueryReportFormatterService {
  /**
   * Prepares report result headers from table schema
   */
  public prepareReportResultHeaders(schema: TableSchema): string[] {
    if (!schema.fields) {
      throw new Error('Failed to get table schema');
    }
    const headers: string[] = [];
    schema.fields.forEach(field => {
      Array.prototype.push.apply(headers, this.getHeadersForField(field));
    });
    return headers;
  }

  /**
   * Gets headers for a specific field
   */
  public getHeadersForField(field: TableField): string[] {
    const fieldHeaders: string[] = [];
    if (field.mode! === 'REPEATED') {
      fieldHeaders.push(field.name!);
    } else if (field.type! === 'RECORD' || field.type! === 'STRUCT') {
      field.fields!.forEach(childField => {
        let childHeaders = this.getHeadersForField(childField);
        childHeaders = childHeaders.map(function (header) {
          return field.name + '.' + header;
        });
        Array.prototype.push.apply(fieldHeaders, childHeaders);
      });
    } else {
      fieldHeaders.push(field.name!);
    }
    return fieldHeaders;
  }

  /**
   * Converts table row data to structured report row data
   */
  public getStructuredReportRowData(tableRow: TableRow): unknown[] {
    const rowData: unknown[] = [];
    const fieldNames = Object.keys(tableRow);
    for (let i = 0; i < fieldNames.length; i++) {
      const cellValue = tableRow[fieldNames[i]];
      if (cellValue != null && cellValue instanceof Array) {
        rowData.push(JSON.stringify(cellValue, null, 2));
      } else if (cellValue != null && cellValue instanceof Object) {
        Array.prototype.push.apply(rowData, this.getStructuredReportRowData(cellValue));
      } else {
        rowData.push(cellValue);
      }
    }
    return rowData;
  }
}
