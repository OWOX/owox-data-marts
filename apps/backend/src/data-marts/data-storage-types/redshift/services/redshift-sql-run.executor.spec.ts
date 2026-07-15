import { RedshiftConnectionType } from '../enums/redshift-connection-type.enum';
import { RedshiftSqlRunExecutor } from './redshift-sql-run.executor';

describe('RedshiftSqlRunExecutor', () => {
  it('preserves provider-neutral type metadata for a zero-row projection', async () => {
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ statementId: 'statement-id' }),
      waitForQueryToComplete: jest.fn().mockResolvedValue(undefined),
      getQueryResults: jest.fn().mockResolvedValue({
        ColumnMetadata: [{ name: 'dq_value', label: 'DQ_VALUE', typeName: 'int8' }],
        Records: [],
      }),
    };
    const adapterFactory = { create: jest.fn().mockReturnValue(adapter) };
    const executor = new RedshiftSqlRunExecutor(adapterFactory as never);

    const batches = [];
    for await (const batch of executor.execute(
      { accessKeyId: 'key', secretAccessKey: 'secret' },
      {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: 'us-east-1',
        database: 'analytics',
        workgroupName: 'warehouse',
      },
      {} as never,
      'SELECT value AS dq_value FROM table WHERE 1 = 0'
    )) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      rows: [],
      columns: ['dq_value'],
      columnMetadata: [{ name: 'dq_value', label: 'DQ_VALUE', typeName: 'int8' }],
    });
  });
});
