import { Inject, Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartSchema } from '../data-mart-schema.type';
import { DATA_MART_SCHEMA_PROVIDER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../interfaces/data-mart-schema-provider.interface';

@Injectable()
export class DataMartSchemaProviderFacade {
  constructor(
    @Inject(DATA_MART_SCHEMA_PROVIDER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataMartSchemaProvider>
  ) {}

  async getActualDataMartSchema(dataMart: DataMart): Promise<DataMartSchema> {
    const definition = dataMart.definition;
    if (!definition) {
      throw new BusinessViolationException('DataMart definition must be provided');
    }

    const config = dataMart.storage.config;
    if (!config) {
      throw new BusinessViolationException('DataMart storage config must be provided');
    }

    const credentials = dataMart.storage.credentials;
    if (!credentials) {
      throw new BusinessViolationException('DataMart storage credentials must be provided');
    }

    const schemaProvider = await this.resolver.resolve(dataMart.storage.type);
    return schemaProvider.getActualDataMartSchema(definition, config, credentials);
  }
}
