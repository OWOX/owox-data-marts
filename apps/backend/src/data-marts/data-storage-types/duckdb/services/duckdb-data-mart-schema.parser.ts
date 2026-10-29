import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import {
  DuckDbDataMartSchema,
  DuckDbDataMartSchemaSchema,
} from '../schemas/duckdb-data-mart-schema.schema';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';

@Injectable()
export class DuckDbDataMartSchemaParser implements DataMartSchemaParser {
  readonly type = DataStorageType.DUCKDB;

  async validateAndParse(schema: unknown): Promise<DuckDbDataMartSchema> {
    const result = DuckDbDataMartSchemaSchema.safeParse(schema);
    if (!result.success) {
      throw new BusinessViolationException(
        `Failed to validate DuckDB schema:\n${result.error.errors[0].message}`,
        { zodErrors: result.error.errors }
      );
    }
    return result.data;
  }
}
