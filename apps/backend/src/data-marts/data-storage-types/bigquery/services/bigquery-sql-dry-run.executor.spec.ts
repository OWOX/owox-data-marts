import { OAuth2Client } from 'google-auth-library';
import { BIGQUERY_OAUTH_TYPE } from '../schemas/bigquery-credentials.schema';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigquerySqlDryRunExecutor, bigQueryColumnTypes } from './bigquery-sql-dry-run.executor';

describe('bigQueryColumnTypes', () => {
  it('maps scalar columns to normalized types', () => {
    expect(
      bigQueryColumnTypes({
        fields: [
          { name: 'flag', type: 'BOOL' },
          { name: 'n', type: 'INT64' },
          { name: 'f', type: 'FLOAT' },
          { name: 'ts', type: 'TIMESTAMP' },
        ],
      })
    ).toEqual(
      new Map([
        ['flag', 'BOOLEAN'],
        ['n', 'INTEGER'],
        ['f', 'FLOAT'],
        ['ts', 'TIMESTAMP'],
      ])
    );
  });

  it('leaves out repeated, record, unknown and unnamed columns', () => {
    expect(
      bigQueryColumnTypes({
        fields: [
          { name: 'tags', type: 'STRING', mode: 'REPEATED' },
          { name: 's', type: 'RECORD', fields: [{ name: 'a', type: 'STRING' }] },
          { name: 's2', type: 'STRUCT' },
          { name: 'x', type: 'NOT_A_TYPE' },
          { type: 'STRING' },
        ],
      }).size
    ).toBe(0);
  });

  it('returns an empty map without a schema', () => {
    expect(bigQueryColumnTypes(undefined).size).toBe(0);
    expect(bigQueryColumnTypes({}).size).toBe(0);
  });
});

describe('BigquerySqlDryRunExecutor', () => {
  it('returns result column types', async () => {
    const adapter = {
      executeDryRunQuery: jest.fn().mockResolvedValue({
        totalBytesProcessed: 10,
        schema: { fields: [{ name: 'flag', type: 'BOOL' }] },
        referencedTables: [],
      }),
    };
    const factory = { create: jest.fn().mockReturnValue(adapter) };
    const executor = new BigquerySqlDryRunExecutor(factory as unknown as BigQueryApiAdapterFactory);
    const credentials = {
      type: BIGQUERY_OAUTH_TYPE,
      oauth2Client: new OAuth2Client(),
      oauthClientId: 'client',
    };

    const result = await executor.execute(
      credentials,
      { projectId: 'my-project-123', location: 'US' },
      'SELECT TRUE AS flag'
    );

    expect(result.isValid).toBe(true);
    expect(result.bytes).toBe(10);
    expect(result.columnTypes?.get('flag')).toBe('BOOLEAN');
  });
});
