import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import {
  BigqueryDataMartSchema,
  BigQueryDataMartSchemaSchema,
} from '../schemas/bigquery-data-mart.schema';

@Injectable()
export class BigQueryDataMartSchemaParser implements DataMartSchemaParser {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  async validateAndParse(schema: unknown): Promise<BigqueryDataMartSchema> {
    const result = BigQueryDataMartSchemaSchema.safeParse(schema);
    if (!result.success) {
      throw new BusinessViolationException(
        `Failed to validate BigQuery schema:\n${result.error.errors[0].message}`,
        { zodErrors: result.error.errors }
      );
    }
    return result.data;
  }
}
