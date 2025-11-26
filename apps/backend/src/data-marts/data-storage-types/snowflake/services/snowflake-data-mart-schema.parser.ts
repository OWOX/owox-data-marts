import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import {
  SnowflakeDataMartSchema,
  SnowflakeDataMartSchemaSchema,
} from '../schemas/snowflake-data-mart-schema.schema';

@Injectable()
export class SnowflakeDataMartSchemaParser implements DataMartSchemaParser {
  readonly type = DataStorageType.SNOWFLAKE;

  async validateAndParse(schema: unknown): Promise<SnowflakeDataMartSchema> {
    const result = SnowflakeDataMartSchemaSchema.safeParse(schema);
    if (!result.success) {
      throw new BusinessViolationException(
        `Failed to validate Snowflake schema:\n${result.error.errors[0].message}`,
        { zodErrors: result.error.errors }
      );
    }
    return result.data;
  }
}
