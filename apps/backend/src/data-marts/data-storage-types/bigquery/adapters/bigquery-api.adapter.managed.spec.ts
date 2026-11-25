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
  const config = { projectId: 'p', location: 'US' } as never;
  const managed = {
    type: BIGQUERY_MANAGED_TYPE,
    authClient: {},
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
  const dryRunReports = (
    statementType: string,
    totalBytesProcessed = '0',
    referencedTables: unknown[] = []
  ) =>
    createQueryJob.mockImplementation(async (cfg: { dryRun?: boolean }) =>
      cfg.dryRun
        ? [
            {
              metadata: {
                statistics: { totalBytesProcessed, query: { statementType, referencedTables } },
              },
            },
          ]
        : [job]
    );
  const jobConfigs = () => createQueryJob.mock.calls.map(([cfg]) => cfg).filter(cfg => !cfg.dryRun);

  beforeEach(() => {
    jest.clearAllMocks();
    job.getMetadata.mockResolvedValue([{ status: { state: 'DONE' } }]);
    query.mockResolvedValue([[{ last_modified_time: '1769337000000' }], undefined, {}]);
    (BigQuery as unknown as jest.Mock).mockImplementation(() => ({ createQueryJob, query }));
    dryRunReports('SELECT');
  });

  it.each([
    'SCRIPT',
    'DELETE',
    'INSERT',
    'MERGE',
    'CREATE_TABLE_AS_SELECT',
    'EXPORT_DATA',
    'DROP_TABLE',
  ])('refuses a %s on a managed storage before running it', async statementType => {
    dryRunReports(statementType);

    await expect(
      new BigQueryApiAdapter(managed, config).executeQuery('SELECT 1; DROP TABLE t')
    ).rejects.toThrow(new OwoxStorageStatementException(statementType));
    expect(createQueryJob).toHaveBeenCalledTimes(1);
  });

  it('runs a SELECT on an OWOX Storage after the dry run, without a byte cap', async () => {
    dryRunReports('SELECT', '1073741824');

    await new BigQueryApiAdapter(managed, config).executeQuery('SELECT 1');

    expect(createQueryJob.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(jobConfigs()).toEqual([expect.objectContaining({ query: 'SELECT 1' })]);
    expect(jobConfigs()[0]).not.toHaveProperty('maximumBytesBilled');
  });

  describe("Google's daily quota", () => {
    const GOOGLE_QUOTA =
      'OWOX Storage has used its query capacity for today. It resets at midnight Pacific Time. If you need it sooner, contact OWOX support.';
    const customQuota =
      'Custom quota exceeded: Your usage exceeded the custom quota for QueryUsagePerUserPerDay, which is set by your administrator.';
    const refuseJobCreation = (error: Error) =>
      createQueryJob.mockImplementation(async (cfg: { dryRun?: boolean }) => {
        if (!cfg.dryRun) throw error;
        return [
          {
            metadata: {
              statistics: { totalBytesProcessed: '0', query: { statementType: 'SELECT' } },
            },
          },
        ];
      });
    const failJob = (reason: string, message: string) =>
      job.getMetadata.mockResolvedValue([
        { status: { state: 'DONE', errorResult: { reason, message } } },
      ]);

    it("answers Google's daily quota refusal at job creation with the OWOX Storage message", async () => {
      refuseJobCreation(
        Object.assign(new Error(customQuota), { code: 403, errors: [{ reason: 'quotaExceeded' }] })
      );

      const error = await new BigQueryApiAdapter(managed, config)
        .executeQuery('SELECT 1')
        .catch(e => e);

      expect(error).toBeInstanceOf(OwoxStorageQueryLimitException);
      expect(error.message).toBe(GOOGLE_QUOTA);
    });

    it("answers Google's daily quota refusal of the dry run with the OWOX Storage message", async () => {
      createQueryJob.mockRejectedValue(
        Object.assign(new Error(customQuota), { code: 403, errors: [{ reason: 'quotaExceeded' }] })
      );

      const error = await new BigQueryApiAdapter(managed, config)
        .executeQuery('SELECT 1')
        .catch(e => e);

      expect(error).toBeInstanceOf(OwoxStorageQueryLimitException);
      expect(error.message).toBe(GOOGLE_QUOTA);
      expect(jobConfigs()).toEqual([]);
    });

    it("answers Google's daily quota refusal of a finished job with the OWOX Storage message", async () => {
      failJob(
        'quotaExceeded',
        'Custom quota exceeded: Your usage exceeded the custom quota for QueryUsagePerDay, which is set by your administrator.'
      );

      const error = await new BigQueryApiAdapter(managed, config)
        .executeQuery('SELECT 1')
        .catch(e => e);

      expect(error).toBeInstanceOf(OwoxStorageQueryLimitException);
      expect(error.message).toBe(GOOGLE_QUOTA);
    });

    it('keeps other quota errors as they are', async () => {
      failJob('quotaExceeded', 'Exceeded rate limits: too many concurrent queries');

      const error = await new BigQueryApiAdapter(managed, config)
        .executeQuery('SELECT 1')
        .catch(e => e);

      expect(error).not.toBeInstanceOf(OwoxStorageQueryLimitException);
      expect(error.message).toBe('Exceeded rate limits: too many concurrent queries');
    });

    it("leaves a regular storage's quota error as it is", async () => {
      failJob('quotaExceeded', customQuota);

      const error = await new BigQueryApiAdapter(serviceAccount, config)
        .executeQuery('SELECT 1')
        .catch(e => e);

      expect(error).not.toBeInstanceOf(OwoxStorageQueryLimitException);
      expect(error.message).toBe(customQuota);
    });
  });

  it('leaves a regular storage unchanged', async () => {
    await new BigQueryApiAdapter(serviceAccount, config).executeQuery('SELECT 1');

    expect(createQueryJob).toHaveBeenCalledTimes(1);
    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('maximumBytesBilled');
    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('dryRun');
  });

  it('executeViewDdl skips the SELECT check', async () => {
    await new BigQueryApiAdapter(managed, config).executeViewDdl('CREATE OR REPLACE VIEW v AS 1');

    expect(createQueryJob).toHaveBeenCalledTimes(1);
    expect(createQueryJob.mock.calls[0][0]).toMatchObject({
      query: 'CREATE OR REPLACE VIEW v AS 1',
    });
    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('maximumBytesBilled');
  });

  it('executeDryRunQuery returns statementType', async () => {
    dryRunReports('CREATE_VIEW');

    const result = await new BigQueryApiAdapter(managed, config).executeDryRunQuery('x');

    expect(result.statementType).toBe('CREATE_VIEW');
  });

  it('reads the shard metadata without a dry run or a byte cap', async () => {
    await new BigQueryApiAdapter(managed, config).getMaxShardLastModified('p', 'ds', 'events_');

    expect(createQueryJob).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).not.toHaveProperty('maximumBytesBilled');
  });

  it('checks access without a dry run', async () => {
    await new BigQueryApiAdapter(managed, config).checkAccess();

    expect(createQueryJob).not.toHaveBeenCalled();
  });

  it('createFromStorage accepts managed credentials', async () => {
    const factory = new BigQueryApiAdapterFactory({ resolve: async () => managed } as never);

    const adapter = await factory.createFromStorage({ id: 's' } as DataStorage, config);

    expect(adapter).toBeInstanceOf(BigQueryApiAdapter);
  });
});
