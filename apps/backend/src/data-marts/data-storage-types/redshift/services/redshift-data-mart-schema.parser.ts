import { Injectable } from '@nestjs/common';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchema } from '../../data-mart-schema.type';
import { RedshiftDataMartSchemaSchema } from '../schemas/redshift-data-mart-schema.schema';

@Injectable()
export class RedshiftDataMartSchemaParser implements DataMartSchemaParser {
  readonly type = DataStorageType.AWS_REDSHIFT;

  async validateAndParse(schema: unknown): Promise<DataMartSchema> {
    const result = RedshiftDataMartSchemaSchema.safeParse(schema);

    if (!result.success) {
      throw new Error(`Invalid Redshift data mart schema: ${JSON.stringify(result.error.errors)}`);
    }

    return result.data;
  }
}
