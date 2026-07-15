import {
  DATA_QUALITY_SQL_DIALECT_RESOLVER,
  dataStorageResolverProviders,
} from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DATA_QUALITY_SQL_DIALECTS, DataQualitySqlDialect } from './data-quality-sql-dialect';

describe('Data Quality dialect providers', () => {
  it('registers all six dialects in the existing storage provider graph', async () => {
    for (const dialectClass of DATA_QUALITY_SQL_DIALECTS) {
      expect(dataStorageResolverProviders).toContain(dialectClass);
    }

    const resolverProvider = dataStorageResolverProviders.find(
      provider =>
        typeof provider === 'object' && provider.provide === DATA_QUALITY_SQL_DIALECT_RESOLVER
    );
    expect(resolverProvider).toBeDefined();

    const provider = resolverProvider as {
      useFactory: (...dialects: DataQualitySqlDialect[]) => {
        resolve(type: DataStorageType): Promise<DataQualitySqlDialect>;
      };
    };
    const dialects = DATA_QUALITY_SQL_DIALECTS.map(Dialect => new Dialect());
    const resolver = provider.useFactory(...dialects);

    for (const storageType of Object.values(DataStorageType)) {
      await expect(resolver.resolve(storageType)).resolves.toMatchObject({ type: storageType });
    }
  });
});
