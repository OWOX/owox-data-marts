jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { Logger } from '@nestjs/common';
import { BigQueryReportReader } from '../data-storage-types/bigquery/services/bigquery-report-reader.service';
import { SnowflakeReportReader } from '../data-storage-types/snowflake/services/snowflake-report-reader.service';
import { RedshiftApiAdapter } from '../data-storage-types/redshift/adapters/redshift-api.adapter';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type { ReportLike } from '../dto/domain/report-like-read-plan';

const secret = 'private-connector-configuration';
const providerError = new Error('private-provider-error-payload');
const query = "SELECT 'private-sql-literal'";

function report(schemaType: string): ReportLike {
  return {
    dataMart: {
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: {
            name: 'source',
            node: 'node',
            fields: ['field'],
            configuration: [{ token: secret }],
          },
          storage: { fullyQualifiedName: 'project.dataset.output' },
        },
      },
      storage: { id: 'storage', config: { projectId: 'project-id', location: 'US' } },
      schema: { type: schemaType, fields: [] },
    },
  } as unknown as ReportLike;
}

describe('preview reader diagnostics', () => {
  let debug: jest.SpyInstance;
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('BigQuery retains failure behavior without logging connector config or provider error bodies', async () => {
    const adapter = { executeQuery: jest.fn().mockRejectedValue(providerError) };
    const reader = new BigQueryReportReader(
      { createFromStorage: jest.fn().mockResolvedValue(adapter) } as never,
      {} as never,
      { generateHeaders: jest.fn().mockReturnValue([]) } as never,
      {} as never
    );
    await reader.prepareReportData(report('bigquery-data-mart-schema'), { sqlOverride: query });
    await expect(reader.readReportDataBatch()).rejects.toBe(providerError);
    const logged = JSON.stringify([debug.mock.calls, error.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('private-provider-error-payload');
    expect(logged).not.toContain('private-sql-literal');
    expect(adapter.executeQuery).toHaveBeenCalledWith(query, undefined, undefined, undefined);
  });

  it('Snowflake executes the real query while logging its length without SQL', async () => {
    const adapter = { executeQuery: jest.fn().mockResolvedValue({ queryId: 'query-id' }) };
    const reader = new SnowflakeReportReader(
      { createFromStorage: jest.fn().mockResolvedValue(adapter) } as never,
      {} as never,
      { generateHeaders: jest.fn().mockReturnValue([]) } as never
    );
    await reader.prepareReportData(report('snowflake-data-mart-schema'), { sqlOverride: query });
    expect(adapter.executeQuery).toHaveBeenCalledWith(query, false, undefined, undefined);
    expect(JSON.stringify(debug.mock.calls)).not.toContain('private-sql-literal');
    expect(JSON.stringify(debug.mock.calls)).not.toContain(secret);
  });

  it('Redshift dry-run preserves EXPLAIN execution without logging SQL literals', async () => {
    const adapter = new RedshiftApiAdapter(
      { accessKeyId: 'id', secretAccessKey: 'key' } as never,
      { region: 'us-east-1' } as never
    );
    const execute = jest
      .spyOn(adapter, 'executeQuery')
      .mockResolvedValue({ statementId: 'statement' });
    jest.spyOn(adapter, 'waitForQueryToComplete').mockResolvedValue(undefined);
    await adapter.executeDryRunQuery(query);
    expect(execute).toHaveBeenCalledWith(`EXPLAIN ${query}`);
    expect(JSON.stringify(debug.mock.calls)).not.toContain('private-sql-literal');
  });
});
