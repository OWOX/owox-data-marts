import { BigQuery } from '@google-cloud/bigquery';
import { BigQueryApiAdapter } from './bigquery-api.adapter';
import { BigQueryApiAdapterFactory } from './bigquery-api-adapter.factory';
import { BIGQUERY_MANAGED_TYPE } from '../schemas/bigquery-credentials.schema';
import {
  OwoxStorageQueryLimitException,
  OwoxStorageStatementException,
} from '../../../owox-storage/owox-storage.exceptions';
import type { DataStorage } from '../../../entities/data-storage.entity';

jest.mock('@google-cloud/bigquery', () => ({ BigQuery: jest.fn() }));

describe('BigQueryApiAdapter (OWOX Storage)', () => {
  const createQueryJob = jest.fn();
  const query = jest.fn();
  const remainingBytes = jest.fn();
  const config = { projectId: 'p', location: 'US' } as never;
  const managed = {
    type: BIGQUERY_MANAGED_TYPE,
    authClient: {},
    scanBudget: { remainingBytes },
  } as never;
  const serviceAccount = {
    type: 'service_account',
    client_email: 'sa@p.iam.gserviceaccount.com',
    private_key: 'key',
  } as never;

  const job = {
    id: 'job-1',
    metadata: {},
    getMetadata: jest.fn(),
    cancel: jest.fn(),
  };
  const dryRunReports = (statementType: string) =>
    createQueryJob.mockImplementation(async (cfg: { dryRun?: boolean }) =>
      cfg.dryRun
        ? [{ metadata: { statistics: { totalBytesProcessed: '0', query: { statementType } } } }]
        : [job]
    );
  const jobConfigs = () => createQueryJob.mock.calls.map(([cfg]) => cfg).filter(cfg => !cfg.dryRun);

  beforeEach(() => {
    jest.clearAllMocks();
    job.getMetadata.mockResolvedValue([{ status: { state: 'DONE' } }]);
    remainingBytes.mockResolvedValue(5 * 2 ** 30);
    query.mockResolvedValue([[{ last_modified_time: '1769337000000' }], undefined, {}]);
    (BigQuery as unknown as jest.Mock).mockImplementation(() => ({ createQueryJob, query }));
    dryRunReports('SELECT');
  });

  it('refuses a non-SELECT statement on a managed storage before running it', async () => {
    dryRunReports('SCRIPT');

    await expect(
      new BigQueryApiAdapter(managed, config).executeQuery('SELECT 1; DROP TABLE t')
    ).rejects.toThrow(new OwoxStorageStatementException('SCRIPT'));
    expect(createQueryJob).toHaveBeenCalledTimes(1);
    expect(remainingBytes).not.toHaveBeenCalled();
  });

  it('sets maximumBytesBilled to what is left', async () => {
    await new BigQueryApiAdapter(managed, config).executeQuery('SELECT 1');

    expect(createQueryJob.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('maximumBytesBilled');
    expect(jobConfigs()).toEqual([
      expect.objectContaining({ query: 'SELECT 1', maximumBytesBilled: '5368709120' }),
    ]);
  });

  it('refuses at the limit before creating the job', async () => {
    remainingBytes.mockRejectedValue(new OwoxStorageQueryLimitException());

    await expect(new BigQueryApiAdapter(managed, config).executeQuery('SELECT 1')).rejects.toThrow(
      OwoxStorageQueryLimitException
    );
    expect(jobConfigs()).toEqual([]);
  });

  it('leaves a regular storage unchanged', async () => {
    await new BigQueryApiAdapter(serviceAccount, config).executeQuery('SELECT 1');

    expect(createQueryJob).toHaveBeenCalledTimes(1);
    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('maximumBytesBilled');
    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('dryRun');
  });

  it('executeViewDdl skips the SELECT check but keeps the budget', async () => {
    await new BigQueryApiAdapter(managed, config).executeViewDdl('CREATE OR REPLACE VIEW v AS 1');

    expect(createQueryJob).toHaveBeenCalledTimes(1);
    expect(createQueryJob.mock.calls[0][0]).toMatchObject({
      query: 'CREATE OR REPLACE VIEW v AS 1',
      maximumBytesBilled: '5368709120',
    });
  });

  it('executeDryRunQuery returns statementType', async () => {
    dryRunReports('CREATE_VIEW');

    const result = await new BigQueryApiAdapter(managed, config).executeDryRunQuery('x');

    expect(result.statementType).toBe('CREATE_VIEW');
    expect(remainingBytes).not.toHaveBeenCalled();
  });

  it('budgets the shard metadata read without a dry run', async () => {
    await new BigQueryApiAdapter(managed, config).getMaxShardLastModified('p', 'ds', 'events_');

    expect(createQueryJob).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toMatchObject({ maximumBytesBilled: '5368709120' });
  });

  it('checks access without the budget', async () => {
    await new BigQueryApiAdapter(managed, config).checkAccess();

    expect(remainingBytes).not.toHaveBeenCalled();
    expect(createQueryJob).not.toHaveBeenCalled();
  });

  it('createFromStorage accepts managed credentials', async () => {
    const factory = new BigQueryApiAdapterFactory({ resolve: async () => managed } as never);

    const adapter = await factory.createFromStorage({ id: 's' } as DataStorage, config);

    expect(adapter).toBeInstanceOf(BigQueryApiAdapter);
  });
});
