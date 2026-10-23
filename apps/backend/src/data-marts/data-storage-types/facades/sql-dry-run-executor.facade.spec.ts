import { SqlDryRunResult } from '../../dto/domain/sql-dry-run-result.dto';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlDryRunExecutorFacade } from './sql-dry-run-executor.facade';

describe('SqlDryRunExecutorFacade', () => {
  it('resolves the executor by storage type and forwards every argument', async () => {
    const executor = {
      type: DataStorageType.DUCKDB,
      execute: jest.fn().mockResolvedValue(SqlDryRunResult.success()),
    };
    const resolver = { resolve: jest.fn().mockResolvedValue(executor) };
    const facade = new SqlDryRunExecutorFacade(resolver as never);
    const credentials = { token: 'c' } as never;
    const config = { path: 'x' } as never;

    const result = await facade.execute(DataStorageType.DUCKDB, credentials, config, 'SELECT 1');

    expect(resolver.resolve).toHaveBeenCalledWith(DataStorageType.DUCKDB);
    expect(executor.execute).toHaveBeenCalledWith(credentials, config, 'SELECT 1');
    expect(result.isValid).toBe(true);
  });
});
