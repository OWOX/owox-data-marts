import { Injectable } from '@nestjs/common';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ReportHeadersGenerator } from '../../interfaces/report-headers-generator.interface';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isDatabricksDataMartSchema } from '../../data-mart-schema.guards';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

/**
 * Service for generating report headers exclusively from Databricks data mart schema
 */
@Injectable()
export class DatabricksReportHeadersGenerator implements ReportHeadersGenerator {
  readonly type = DataStorageType.DATABRICKS;

  generateHeaders(dataMartSchema: DataMartSchema): ReportDataHeader[] {
    if (!isDatabricksDataMartSchema(dataMartSchema)) {
      throw new Error('Databricks data mart schema is required');
    }

    if (!dataMartSchema.fields) {
      throw new Error('Databricks data mart schema fields are required');
    }

    return dataMartSchema.fields
      .filter(field => field.status !== DataMartSchemaFieldStatus.DISCONNECTED)
      .map(field => new ReportDataHeader(field.name, field.alias, field.description, field.type));
  }
}
