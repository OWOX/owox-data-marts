import { SnowflakeReportReader } from './snowflake-report-reader.service';

describe('SnowflakeReportReader queryTimeoutMs threading (Phase 3)', () => {
  const buildReport = () =>
    ({
      dataMart: {
        storage: { id: 's1' },
        definition: { sqlQuery: 'SELECT 1' },
        schema: { type: 'snowflake-data-mart-schema', fields: [] },
      },
    }) as never;

  const createReader = () => {
    const adapter = {
      executeQuery: jest
        .fn()
        .mockResolvedValue({ queryId: 'q1', rows: [], metadata: { columns: [] } }),
      fetchResultsByQueryId: jest.fn().mockResolvedValue([]),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn().mockReturnValue('SELECT built') };
    const headersGenerator = { generateHeaders: jest.fn().mockReturnValue([]) };
    const reader = new SnowflakeReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never
    );
    return { reader, adapter };
  };

  it('threads options.queryTimeoutMs and signal into adapter.executeQuery', async () => {
    const { reader, adapter } = createReader();
    const signal = new AbortController().signal;

    await reader.prepareReportData(buildReport(), {
      sqlOverride: 'SELECT 1',
      queryTimeoutMs: 30000,
      signal,
    });

    expect(adapter.executeQuery).toHaveBeenCalledWith('SELECT 1', false, 30000, signal);
  });

  it('passes an undefined timeout and signal when the options are absent (regression)', async () => {
    const { reader, adapter } = createReader();

    await reader.prepareReportData(buildReport(), { sqlOverride: 'SELECT 1' });

    expect(adapter.executeQuery).toHaveBeenCalledWith('SELECT 1', false, undefined, undefined);
  });
});
