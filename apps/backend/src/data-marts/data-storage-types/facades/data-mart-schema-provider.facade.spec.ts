import { DataMart } from '../../entities/data-mart.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaProviderFacade } from './data-mart-schema-provider.facade';

describe('DataMartSchemaProviderFacade', () => {
  it('resolves the provider by storage type and forwards the definition, config and credentials', async () => {
    const schema = { type: 'duckdb-data-mart-schema', fields: [] };
    const provider = {
      type: DataStorageType.DUCKDB,
      getActualDataMartSchema: jest.fn().mockResolvedValue(schema),
    };
    const resolver = { resolve: jest.fn().mockResolvedValue(provider) };
    const credentials = { token: 'c' };
    const credentialsResolver = { resolve: jest.fn().mockResolvedValue(credentials) };
    const facade = new DataMartSchemaProviderFacade(
      resolver as never,
      credentialsResolver as never
    );
    const dataMart = {
      definition: { fullyQualifiedName: 'main.orders' },
      storage: { id: 'storage-1', type: DataStorageType.DUCKDB, config: { path: 'x' } },
    } as unknown as DataMart;

    const result = await facade.getActualDataMartSchema(dataMart);

    expect(credentialsResolver.resolve).toHaveBeenCalledWith(dataMart.storage);
    expect(resolver.resolve).toHaveBeenCalledWith(DataStorageType.DUCKDB);
    expect(provider.getActualDataMartSchema).toHaveBeenCalledWith(
      dataMart.definition,
      dataMart.storage.config,
      credentials
    );
    expect(result).toBe(schema);
  });
});
