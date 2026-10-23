import { SqlDryRunService } from './sql-dry-run.service';
import { SqlDryRunCommand } from '../dto/domain/sql-dry-run.command';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('SqlDryRunService', () => {
  const baseDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
  };

  const createService = (storage: Record<string, unknown>) => {
    const dataMart = { ...baseDataMart, storage };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const sqlDryRunExecutorFacade = {
      execute: jest.fn().mockResolvedValue(SqlDryRunResult.success()),
    };
    const dataMartSqlTableService = {
      resolveDataMartTableMacro: jest
        .fn()
        .mockImplementation((_dataMart: unknown, sql: string) => Promise.resolve(sql)),
    };
    const credentialsResolver = {
      resolve: jest.fn().mockResolvedValue({}),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const service = new SqlDryRunService(
      dataMartService as never,
      sqlDryRunExecutorFacade as never,
      dataMartSqlTableService as never,
      credentialsResolver as never,
      accessDecisionService as never
    );

    return {
      service,
      dataMartService,
      sqlDryRunExecutorFacade,
      dataMartSqlTableService,
      credentialsResolver,
      accessDecisionService,
      dataMart,
    };
  };

  const command = () => new SqlDryRunCommand('dm-1', 'proj-1', 'SELECT 1');

  it('runs the dry run when credentials are present', async () => {
    const { service, sqlDryRunExecutorFacade } = createService({
      id: 'st-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p' },
      credentialId: 'cred-1',
    });

    const result = await service.run(command());

    expect(result.isValid).toBe(true);
    expect(sqlDryRunExecutorFacade.execute).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      {},
      { projectId: 'p' },
      'SELECT 1'
    );
  });

  it('still fails for a credential-less non-DuckDB storage', async () => {
    const { service, sqlDryRunExecutorFacade } = createService({
      id: 'st-2',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p' },
      credentialId: null,
    });

    const result = await service.run(command());

    expect(result.isValid).toBe(false);
    expect(sqlDryRunExecutorFacade.execute).not.toHaveBeenCalled();
  });

  it('runs the dry run for a credential-less DuckDB storage (no "setup not finished")', async () => {
    const { service, sqlDryRunExecutorFacade } = createService({
      id: 'st-3',
      type: DataStorageType.DUCKDB,
      config: {},
      credentialId: null,
    });

    const result = await service.run(command());

    expect(result.isValid).toBe(true);
    expect(sqlDryRunExecutorFacade.execute).toHaveBeenCalledWith(
      DataStorageType.DUCKDB,
      {},
      {},
      'SELECT 1'
    );
  });
});
