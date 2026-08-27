import { dataStorageResolverProviders } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  FORMULA_FUNCTION_DIALECT_RESOLVER,
  FormulaFunctionDialect,
} from './formula-function-dialect';

describe('Formula function dialect provider', () => {
  it('wires FORMULA_FUNCTION_DIALECT_RESOLVER into the existing storage provider graph', async () => {
    const resolverProvider = dataStorageResolverProviders.find(
      provider =>
        typeof provider === 'object' && provider.provide === FORMULA_FUNCTION_DIALECT_RESOLVER
    );
    expect(resolverProvider).toBeDefined();

    const provider = resolverProvider as {
      useFactory: () => { resolve(type: DataStorageType): Promise<FormulaFunctionDialect> };
    };
    const resolver = provider.useFactory();

    for (const storageType of Object.values(DataStorageType)) {
      await expect(resolver.resolve(storageType)).resolves.toMatchObject({ type: storageType });
    }
  });
});
