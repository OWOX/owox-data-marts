import { DataMartSchema } from '../data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { ReportHeadersGenerator } from './report-headers-generator.interface';

// BigQuery needs RECORD/REPEATED recursion and keeps its own implementation.
export abstract class FlatReportHeadersGenerator implements ReportHeadersGenerator {
  abstract readonly type: DataStorageType;
  protected abstract readonly storageName: string;
  protected abstract isSchemaValid(schema: DataMartSchema): boolean;

  generateHeaders(dataMartSchema: DataMartSchema): ReportDataHeader[] {
    if (!this.isSchemaValid(dataMartSchema)) {
      throw new Error(`${this.storageName} data mart schema is required`);
    }

    if (!dataMartSchema.fields) {
      throw new Error(`${this.storageName} data mart schema fields are required`);
    }

    return dataMartSchema.fields
      .filter(
        field =>
          field.status !== DataMartSchemaFieldStatus.DISCONNECTED && !field.isHiddenForReporting
      )
      .map(field => new ReportDataHeader(field.name, field.alias, field.description, field.type));
  }
}
