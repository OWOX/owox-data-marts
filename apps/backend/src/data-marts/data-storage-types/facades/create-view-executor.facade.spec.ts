import { DataStorageType } from '../enums/data-storage-type.enum';
import { CreateViewExecutorFacade } from './create-view-executor.facade';

describe('CreateViewExecutorFacade', () => {
  it('resolves the executor by storage type and forwards every argument', async () => {
    const executor = {
      type: DataStorageType.DUCKDB,
      createView: jest.fn().mockResolvedValue({ fullyQualifiedName: 'main.v' }),
    };
    const resolver = { resolve: jest.fn().mockResolvedValue(executor) };
    const facade = new CreateViewExecutorFacade(resolver as never);
    const credentials = { token: 'c' } as never;
    const config = { path: 'x' } as never;

    const result = await facade.createView(
      DataStorageType.DUCKDB,
      credentials,
      config,
      'main.v',
      'SELECT 1'
    );

    expect(resolver.resolve).toHaveBeenCalledWith(DataStorageType.DUCKDB);
    expect(executor.createView).toHaveBeenCalledWith(credentials, config, 'main.v', 'SELECT 1');
    expect(result).toEqual({ fullyQualifiedName: 'main.v' });
  });
});
