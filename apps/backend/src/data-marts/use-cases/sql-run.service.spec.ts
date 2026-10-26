import { SqlRunService } from './sql-run.service';

describe('SqlRunService', () => {
  const storage = { id: 's1', type: 'GOOGLE_BIGQUERY', config: {}, credentialId: null };

  function create(hasCredentials: boolean) {
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ storage, definition: {} }),
    };
    const executor = {
      executeBatches: jest.fn().mockImplementation(async function* () {
        yield { rows: [{ a: 1 }] };
      }),
    };
    const resolver = {
      hasCredentials: jest.fn().mockResolvedValue(hasCredentials),
      resolve: jest.fn().mockResolvedValue({ type: 'service_account' }),
    };
    const service = new SqlRunService(
      dataMartService as never,
      executor as never,
      resolver as never
    );
    return { service, resolver, executor };
  }

  const command = { dataMartId: 'dm', projectId: 'p', sql: 'select 1' } as never;

  it('runs a bound Storage whose old credential link is null', async () => {
    const { service, resolver } = create(true);

    const rows: unknown[] = [];
    for await (const row of service.runRows(command)) rows.push(row);

    expect(rows).toEqual([{ a: 1 }]);
    expect(resolver.hasCredentials).toHaveBeenCalledWith(storage);
  });

  it('refuses a Storage without credentials', async () => {
    const { service, executor } = create(false);

    await expect(service.runRows(command).next()).rejects.toThrow('Storage setup is not finished.');
    expect(executor.executeBatches).not.toHaveBeenCalled();
  });
});
