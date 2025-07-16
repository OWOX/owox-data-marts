import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import {
  AthenaDataMartSchema,
  AthenaDataMartSchemaSchema,
} from '../schemas/athena-data-mart-schema.schema';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';

@Injectable()
export class AthenaDataMartSchemaParser implements DataMartSchemaParser {
  readonly type = DataStorageType.AWS_ATHENA;

  async validateAndParse(schema: unknown): Promise<AthenaDataMartSchema> {
    const result = AthenaDataMartSchemaSchema.safeParse(schema);
    if (!result.success) {
      throw new BusinessViolationException(
        `Failed to validate Athena schema:\n${result.error.errors[0].message}`,
        { zodErrors: result.error.errors }
      );
    }
    return result.data;
  }
}
