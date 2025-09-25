import { Injectable } from '@nestjs/common';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ReportHeadersGenerator } from '../../interfaces/report-headers-generator.interface';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isBigQueryDataMartSchema } from '../../data-mart-schema.guards';
import { BigQueryFieldMode } from '../enums/bigquery-field-mode.enum';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';
import { BigqueryDataMartSchema } from '../schemas/bigquery-data-mart.schema';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

/**
 * Service for generating report headers exclusively from BigQuery data mart schema
 */
@Injectable()
export class BigQueryReportHeadersGenerator implements ReportHeadersGenerator {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  generateHeaders(dataMartSchema: DataMartSchema): ReportDataHeader[] {
    if (!isBigQueryDataMartSchema(dataMartSchema)) {
      throw new Error('BigQuery data mart schema is required');
    }

    if (!dataMartSchema.fields) {
      throw new Error('BigQuery data mart schema fields are required');
    }

    const headers: ReportDataHeader[] = [];
    dataMartSchema.fields.forEach(field => {
      headers.push(...this.getHeadersForField(field));
    });
    return headers;
  }

  private getHeadersForField(
    field: BigqueryDataMartSchema['fields'][0],
    parentPath: string = ''
  ): ReportDataHeader[] {
    const fieldHeaders: ReportDataHeader[] = [];
    const fullPath = parentPath ? `${parentPath}.${field.name}` : field.name;

    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) {
      return fieldHeaders;
    }

    if (field.mode === BigQueryFieldMode.REPEATED) {
      fieldHeaders.push(
        new ReportDataHeader(field.name, field.alias, field.description, field.type)
      );
    } else if (field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT) {
      if (field.fields) {
        field.fields.forEach(childField => {
          const childHeaders = this.getHeadersForField(childField, fullPath);
          fieldHeaders.push(
            ...childHeaders.map(
              header =>
                new ReportDataHeader(
                  `${field.name}.${header.name}`,
                  header.alias,
                  header.description,
                  header.storageFieldType
                )
            )
          );
        });
      }
    } else {
      fieldHeaders.push(
        new ReportDataHeader(field.name, field.alias, field.description, field.type)
      );
    }
    return fieldHeaders;
  }
}
