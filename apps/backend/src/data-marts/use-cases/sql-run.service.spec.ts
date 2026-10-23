import { SqlRunService } from './sql-run.service';
import { SqlRunCommand } from '../dto/domain/sql-run.command';
import { SqlRunBatch } from '../dto/domain/sql-run-batch.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('SqlRunService', () => {
  const baseDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definition: { sqlQuery: 'SELECT 1' },
  };

  const createService = (storage: Record<string, unknown>) => {
    const dataMart = { ...baseDataMart, storage };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };

    async function* fakeBatches(): AsyncGenerator<SqlRunBatch<Record<string, unknown>>> {
      yield { rows: [{ a: 1 }], nextBatchId: null };
    }

    const sqlRunExecutorFacade = {
      executeBatches: jest.fn().mockImplementation(() => fakeBatches()),
    };
    const credentialsResolver = {
      resolve: jest.fn().mockResolvedValue({}),
    };

    const service = new SqlRunService(
      dataMartService as never,
      sqlRunExecutorFacade as never,
      credentialsResolver as never
    );

    return { service, dataMartService, sqlRunExecutorFacade, credentialsResolver, dataMart };
  };

  const command = () => new SqlRunCommand('dm-1', 'proj-1', 'SELECT 1', 500);

  const drain = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
    const out: T[] = [];
    for await (const item of gen) out.push(item);
    return out;
  };

  it('runs when credentials are present', async () => {
    const { service, sqlRunExecutorFacade, dataMart } = createService({
      id: 'st-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p' },
      credentialId: 'cred-1',
    });

    const batches = await drain(service.runBatches(command()));

    expect(batches).toEqual([{ rows: [{ a: 1 }], nextBatchId: null }]);
    expect(sqlRunExecutorFacade.executeBatches).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      {},
      { projectId: 'p' },
      dataMart.definition,
      'SELECT 1',
      { maxRowsPerBatch: 500 }
    );
  });

  it('still rejects a credential-less non-DuckDB storage', async () => {
    const { service } = createService({
      id: 'st-2',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p' },
      credentialId: null,
    });

    await expect(drain(service.runBatches(command()))).rejects.toThrow(
      'Storage setup is not finished.'
    );
  });

  it('runs the batches for a credential-less DuckDB storage (no "setup not finished")', async () => {
    const { service, sqlRunExecutorFacade, dataMart } = createService({
      id: 'st-3',
      type: DataStorageType.DUCKDB,
      config: {},
      credentialId: null,
    });

    const batches = await drain(service.runBatches(command()));

    expect(batches).toEqual([{ rows: [{ a: 1 }], nextBatchId: null }]);
    expect(sqlRunExecutorFacade.executeBatches).toHaveBeenCalledWith(
      DataStorageType.DUCKDB,
      {},
      {},
      dataMart.definition,
      'SELECT 1',
      { maxRowsPerBatch: 500 }
    );
  });
});
