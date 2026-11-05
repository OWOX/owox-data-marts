import { BigquerySqlDryRunExecutor } from './bigquery-sql-dry-run.executor';
import type { DataStorageConfig } from '../../data-storage-config.type';
import type { DataStorageCredentials } from '../../data-storage-credentials.type';

describe('BigquerySqlDryRunExecutor (OWOX Storage)', () => {
  const config = { projectId: 'proj-abc', location: 'US' } as unknown as DataStorageConfig;
  const managed = { type: 'bigquery_managed', authClient: {} } as unknown as DataStorageCredentials;
  const plain = {
    type: 'bigquery_oauth',
    accessToken: 'x',
  } as unknown as DataStorageCredentials;
  const executeDryRunQuery = jest.fn();
  const executor = new BigquerySqlDryRunExecutor({
    create: () => ({ executeDryRunQuery }),
  } as never);

  it('fails a non-SELECT statement on a managed storage with the execution gate text', async () => {
    executeDryRunQuery.mockResolvedValue({ totalBytesProcessed: 0, statementType: 'DELETE' });

    const result = await executor.execute(managed, config, 'DELETE FROM t WHERE true');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('OWOX Storage runs SELECT queries only. This query is a DELETE.');
  });

  it('keeps a SELECT on a managed storage successful', async () => {
    executeDryRunQuery.mockResolvedValue({ totalBytesProcessed: 42, statementType: 'SELECT' });

    const result = await executor.execute(managed, config, 'SELECT 1');

    expect(result.isValid).toBe(true);
    expect(result.bytes).toBe(42);
  });

  it('leaves a non-SELECT on a non-managed storage unchanged', async () => {
    executeDryRunQuery.mockResolvedValue({ totalBytesProcessed: 0, statementType: 'DELETE' });

    const result = await executor.execute(plain, config, 'DELETE FROM t WHERE true');

    expect(result.isValid).toBe(true);
  });
});
