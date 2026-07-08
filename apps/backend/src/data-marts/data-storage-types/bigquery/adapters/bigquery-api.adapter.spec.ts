import { BigQuery } from '@google-cloud/bigquery';
import { BigQueryApiAdapter } from './bigquery-api.adapter';
import { BIGQUERY_AUTODETECT_LOCATION } from '../schemas/bigquery-config.schema';
import { BIGQUERY_OAUTH_TYPE } from '../schemas/bigquery-credentials.schema';

// Mock only the BigQuery constructor — the adapter uses it as the single value import;
// everything else it imports from the SDK is type-only and erased at compile time.
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: jest.fn(),
}));

describe('BigQueryApiAdapter jobTimeoutMs (Phase 3)', () => {
  const createQueryJob = jest.fn();

  const createAdapter = () => {
    const job = {
      id: 'job-1',
      metadata: {},
      getMetadata: jest.fn().mockResolvedValue([{ status: { state: 'DONE' } }]),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    createQueryJob.mockResolvedValue([job]);
    (BigQuery as unknown as jest.Mock).mockImplementation(() => ({ createQueryJob }));

    // OAuth-type credentials keep the JWT branch (google-auth-library) out of the constructor.
    const credentials = { type: BIGQUERY_OAUTH_TYPE, oauth2Client: {} } as never;
    const config = { projectId: 'my-project', location: BIGQUERY_AUTODETECT_LOCATION } as never;
    return { adapter: new BigQueryApiAdapter(credentials, config), job };
  };

  beforeEach(() => jest.clearAllMocks());

  it('adds jobTimeoutMs (ms, verbatim) to the query config when a timeout is passed', async () => {
    const { adapter } = createAdapter();

    await adapter.executeQuery('SELECT 1', undefined, 30000);

    expect(createQueryJob).toHaveBeenCalledTimes(1);
    expect(createQueryJob.mock.calls[0][0]).toMatchObject({
      query: 'SELECT 1',
      jobTimeoutMs: 30000,
    });
  });

  it('omits jobTimeoutMs entirely when no timeout is passed (regression)', async () => {
    const { adapter } = createAdapter();

    await adapter.executeQuery('SELECT 1');

    expect(createQueryJob.mock.calls[0][0]).not.toHaveProperty('jobTimeoutMs');
  });

  it('adds jobTimeoutMs alongside named params when both are provided', async () => {
    const { adapter } = createAdapter();

    await adapter.executeQuery('SELECT @a', [{ name: 'a', value: 1 }] as never, 45000);

    expect(createQueryJob.mock.calls[0][0]).toMatchObject({
      parameterMode: 'NAMED',
      jobTimeoutMs: 45000,
    });
  });

  it('cancels the running job when the abort signal fires', async () => {
    const { adapter, job } = createAdapter();
    const controller = new AbortController();
    controller.abort();

    await adapter.executeQuery('SELECT 1', undefined, undefined, controller.signal);

    expect(job.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not cancel the job when no signal is passed (regression)', async () => {
    const { adapter, job } = createAdapter();

    await adapter.executeQuery('SELECT 1');

    expect(job.cancel).not.toHaveBeenCalled();
  });

  it('cancels and surfaces the cancelled job as an error when aborted mid-run', async () => {
    const { adapter, job } = createAdapter();
    const controller = new AbortController();
    // First poll: still running (and triggers the abort); the interruptible sleep then wakes early
    // and the next poll sees the job DONE with a cancellation error.
    job.getMetadata
      .mockImplementationOnce(() => {
        controller.abort();
        return Promise.resolve([{ status: { state: 'RUNNING' } }]);
      })
      .mockResolvedValue([
        { status: { state: 'DONE', errorResult: { message: 'Job stopped by cancel' } } },
      ]);

    await expect(
      adapter.executeQuery('SELECT 1', undefined, undefined, controller.signal)
    ).rejects.toThrow('Job stopped by cancel');
    expect(job.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not busy-poll getMetadata after abort — one immediate re-poll, then a bounded interval', async () => {
    jest.useFakeTimers();
    try {
      const { adapter, job } = createAdapter();
      const controller = new AbortController();
      controller.abort();
      job.getMetadata.mockResolvedValue([{ status: { state: 'RUNNING' } }]);

      const p = adapter.executeQuery('SELECT 1', undefined, undefined, controller.signal);
      // Flush microtasks WITHOUT advancing time: initial poll + exactly one immediate re-poll, then
      // the loop parks on the bounded sleep. A busy-poll would call getMetadata many more times here.
      await jest.advanceTimersByTimeAsync(0);
      expect(job.getMetadata).toHaveBeenCalledTimes(2);

      // The bounded interval must elapse before the next poll; finish the job so the promise settles.
      job.getMetadata.mockResolvedValue([{ status: { state: 'DONE' } }]);
      await jest.advanceTimersByTimeAsync(2000);
      await p;
      expect(job.getMetadata).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
