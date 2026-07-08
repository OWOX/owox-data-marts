import { BigQueryReportReader } from './bigquery-report-reader.service';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';

describe('BigQueryReportReader queryTimeoutMs threading (Phase 3)', () => {
  const buildReport = () =>
    ({
      dataMart: {
        storage: { id: 's1', config: { projectId: 'my-project' } },
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
        schema: { type: 'bigquery-data-mart-schema', fields: [] },
      },
    }) as never;

  const createReader = () => {
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      getJob: jest.fn().mockResolvedValue({
        metadata: {
          configuration: {
            query: { destinationTable: { projectId: 'p', datasetId: 'd', tableId: 't' } },
          },
        },
      }),
      createTableReference: jest.fn().mockReturnValue({
        getRows: jest.fn().mockResolvedValue([[], undefined]),
      }),
    };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn() };
    const headersGenerator = { generateHeaders: jest.fn().mockReturnValue([]) };
    const credentialsResolver = {};
    const reader = new BigQueryReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never,
      credentialsResolver as never
    );
    return { reader, adapter };
  };

  it('threads queryTimeoutMs and signal into adapter.executeQuery', async () => {
    const { reader, adapter } = createReader();
    const signal = new AbortController().signal;

    await reader.prepareReportData(buildReport(), {
      sqlOverride: 'SELECT 1',
      queryTimeoutMs: 30000,
      signal,
    });
    // executeQuery is lazy — the first batch read materializes the destination table.
    await reader.readReportDataBatch();

    expect(adapter.executeQuery).toHaveBeenCalledWith('SELECT 1', undefined, 30000, signal);
  });

  it('passes an undefined timeout and signal when the options are absent (regression)', async () => {
    const { reader, adapter } = createReader();

    await reader.prepareReportData(buildReport(), { sqlOverride: 'SELECT 1' });
    await reader.readReportDataBatch();

    expect(adapter.executeQuery).toHaveBeenCalledWith('SELECT 1', undefined, undefined, undefined);
  });
});
