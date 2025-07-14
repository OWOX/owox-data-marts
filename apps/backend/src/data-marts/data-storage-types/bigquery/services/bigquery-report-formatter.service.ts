import { BigQueryRange } from '@google-cloud/bigquery/build/src/bigquery';
import { Injectable } from '@nestjs/common';
import { TableField, TableRow, TableSchema } from '@google-cloud/bigquery';
import { BigqueryDataMartSchema } from '../schemas/bigquery-data-mart.schema';

/**
 * Service for formatting BigQuery report data
 */
@Injectable()
export class BigQueryReportFormatterService {
  /**
   * Prepares report result headers from table schema
   */
  public prepareReportResultHeaders(
    tableSchema: TableSchema,
    dataMartSchema?: BigqueryDataMartSchema
  ): string[] {
    if (!tableSchema.fields) {
      throw new Error('Failed to get table schema');
    }
    const headers: string[] = [];
    tableSchema.fields.forEach(field => {
      headers.push(...this.getHeadersForField(field, dataMartSchema));
    });
    return headers;
  }

  /**
   * Gets headers for a specific field
   */
  public getHeadersForField(
    field: TableField,
    dataMartSchema?: BigqueryDataMartSchema,
    parentPath: string = ''
  ): string[] {
    const fieldHeaders: string[] = [];
    const fieldName = field.name!;
    const fullPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;

    if (field.mode! === 'REPEATED') {
      const schemaField = this.findFieldInSchema(fullPath, dataMartSchema);
      fieldHeaders.push(schemaField?.alias || fieldName);
    } else if (field.type! === 'RECORD' || field.type! === 'STRUCT') {
      const schemaField = this.findFieldInSchema(fullPath, dataMartSchema);
      field.fields!.forEach(childField => {
        let childHeaders = this.getHeadersForField(childField, dataMartSchema, fullPath);
        childHeaders = childHeaders.map(function (header) {
          return (schemaField?.alias || fieldName) + '.' + header;
        });
        fieldHeaders.push(...childHeaders);
      });
    } else {
      const schemaField = this.findFieldInSchema(fullPath, dataMartSchema);
      fieldHeaders.push(schemaField?.alias || fieldName);
    }
    return fieldHeaders;
  }

  /**
   * Finds a field in the datamart schema by path
   */
  private findFieldInSchema(
    path: string,
    dataMartSchema?: BigqueryDataMartSchema
  ): { name: string; alias?: string } | undefined {
    if (!dataMartSchema || !dataMartSchema.fields) {
      return undefined;
    }

    const pathParts = path.split('.');
    let currentFields = dataMartSchema.fields;
    let currentField;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      currentField = currentFields.find(f => f.name === part);

      if (!currentField) {
        return undefined;
      }

      if (i < pathParts.length - 1) {
        if (!currentField.fields) {
          return undefined;
        }
        currentFields = currentField.fields;
      }
    }

    return currentField;
  }

  /**
   * Converts table row data to structured report row data
   */
  public getStructuredReportRowData(tableRow: TableRow): unknown[] {
    const rowData: unknown[] = [];
    const fieldNames = Object.keys(tableRow);
    for (let i = 0; i < fieldNames.length; i++) {
      const cell = tableRow[fieldNames[i]];
      const cellValue = this.getCellValue(cell);
      if (cellValue instanceof Array) {
        rowData.push(...cellValue);
      } else {
        rowData.push(cellValue);
      }
    }
    return rowData;
  }

  private getCellValue(cell: unknown): unknown {
    const isCellPresent = cell !== null && cell !== undefined;
    if (isCellPresent && cell instanceof Array) {
      return JSON.stringify(cell.map(this.getCellValue.bind(this)), null, 2);
    } else if (isCellPresent && cell instanceof BigQueryRange) {
      return JSON.stringify(cell, null, 2);
    } else if (isCellPresent && cell instanceof Buffer) {
      return cell.toString('utf-8');
    } else if (isCellPresent && typeof cell === 'object') {
      if (cell.constructor.name === 'Big') {
        // BigQuery NUMERIC and BIGNUMERIC wrapper handling
        return cell.toString();
      } else if (cell['value']) {
        // other BigQuery types with wrappers
        return cell['value'];
      } else {
        return this.getStructuredReportRowData(cell);
      }
    } else {
      return cell;
    }
  }
}
