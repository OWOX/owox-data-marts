import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import {
  DatabricksDataMartSchema,
  DatabricksDataMartSchemaSchema,
} from '../schemas/databricks-data-mart-schema.schema';

@Injectable()
export class DatabricksDataMartSchemaParser implements DataMartSchemaParser {
  readonly type = DataStorageType.DATABRICKS;

  async validateAndParse(schema: unknown): Promise<DatabricksDataMartSchema> {
    const result = DatabricksDataMartSchemaSchema.safeParse(schema);
    if (!result.success) {
      throw new BusinessViolationException(
        `Failed to validate Databricks schema:\n${result.error.errors[0].message}`,
        { zodErrors: result.error.errors }
      );
    }
    return result.data;
  }
}
