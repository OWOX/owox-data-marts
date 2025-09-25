import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../interfaces/data-mart-schema-parser.interface';
import { DATA_MART_SCHEMA_PARSER_RESOLVER } from '../data-storage-providers';
import { DataMartSchema } from '../data-mart-schema.type';

@Injectable()
export class DataMartSchemaParserFacade {
  constructor(
    @Inject(DATA_MART_SCHEMA_PARSER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataMartSchemaParser>
  ) {}

  async validateAndParse(schema: unknown, storageType: DataStorageType): Promise<DataMartSchema> {
    const parser = await this.resolver.resolve(storageType);
    return parser.validateAndParse(schema);
  }
}
