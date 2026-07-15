import { BIGQUERY_OAUTH_TYPE } from '../schemas/bigquery-credentials.schema';
import { BigQuerySqlRunExecutor } from './bigquery-sql-run.executor';

describe('BigQuerySqlRunExecutor', () => {
  it('forwards the abort signal to the active BigQuery query', async () => {
    const table = {
      getMetadata: jest.fn().mockResolvedValue([{ schema: { fields: [{ name: 'value' }] } }]),
      getRows: jest.fn().mockResolvedValue([[], {}]),
    };
    const job = {
      promise: jest.fn().mockResolvedValue(undefined),
      metadata: {
        status: {},
        configuration: {
          query: {
            destinationTable: {
              projectId: 'project-123456',
              datasetId: 'dataset',
              tableId: 'table',
            },
          },
        },
      },
    };
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ jobId: 'job-id' }),
      getJob: jest.fn().mockResolvedValue(job),
      createTableReference: jest.fn().mockReturnValue(table),
    };
    const adapterFactory = { create: jest.fn().mockReturnValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn() };
    const executor = new BigQuerySqlRunExecutor(adapterFactory as never, queryBuilder as never);
    const controller = new AbortController();

    for await (const _batch of executor.execute(
      { type: BIGQUERY_OAUTH_TYPE, oauth2Client: {} } as never,
      { projectId: 'project-123456', location: 'US' },
      {} as never,
      'SELECT 1',
      { signal: controller.signal }
    )) {
      // consume generator
    }

    expect(adapter.executeQuery).toHaveBeenCalledWith(
      'SELECT 1',
      undefined,
      undefined,
      controller.signal
    );
  });

  it('preserves the BigQuery job error reason when the job reaches an error status', async () => {
    const errorResult = { reason: 'notFound', message: 'Table metadata is unavailable' };
    const job = {
      promise: jest.fn().mockResolvedValue(undefined),
      metadata: {
        status: { errorResult },
        configuration: { query: {} },
      },
    };
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ jobId: 'job-id' }),
      getJob: jest.fn().mockResolvedValue(job),
    };
    const executor = new BigQuerySqlRunExecutor(
      { create: jest.fn().mockReturnValue(adapter) } as never,
      { buildQuery: jest.fn() } as never
    );

    const iterator = executor
      .execute(
        { type: BIGQUERY_OAUTH_TYPE, oauth2Client: {} } as never,
        { projectId: 'project-123456', location: 'US' },
        {} as never,
        'SELECT * FROM missing'
      )
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      reason: 'notFound',
      cause: errorResult,
    });
  });
});
