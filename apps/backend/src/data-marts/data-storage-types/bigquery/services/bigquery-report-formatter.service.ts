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
    dataMartSchema: BigqueryDataMartSchema
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
      const cellValue = tableRow[fieldNames[i]];
      if (cellValue != null && cellValue instanceof Array) {
        rowData.push(JSON.stringify(cellValue, null, 2));
      } else if (cellValue != null && cellValue instanceof Object) {
        if (cellValue.constructor.name === 'Big') {
          // BigQuery lib wraps NUMERIC and BIGNUMERIC types
          rowData.push(cellValue.toString());
        } else {
          rowData.push(...this.getStructuredReportRowData(cellValue));
        }
      } else {
        rowData.push(cellValue);
      }
    }
    return rowData;
  }
}
