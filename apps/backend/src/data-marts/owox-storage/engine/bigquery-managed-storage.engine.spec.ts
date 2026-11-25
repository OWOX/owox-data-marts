import { Logger, NotFoundException } from '@nestjs/common';
import { OwoxStorageProvisioningException } from '../owox-storage.exceptions';
import { BigQueryManagedStorageEngine } from './bigquery-managed-storage.engine';
import type { OwoxStorageProvisioningClient } from './owox-storage-provisioning.client';

const EMAIL = 'owox-st-abcdef012345@owox-storage-sa.iam.gserviceaccount.com';
const CREATED = {
  gcpProjectId: 'owox-gcp',
  datasetId: 'owox_eu_abcdef012345',
  internalDatasetId: 'owox_eu_abcdef012345_internal',
  location: 'EU' as const,
  serviceAccountEmail: EMAIL,
};

/** What google-auth-library throws when IAM refuses the token; its message names the account. */
const googleError = (status: number) =>
  Object.assign(new Error(`unable to impersonate ${EMAIL}`), { status, code: status });

const listedTable = (id: string, metadata: object) => ({
  id,
  getMetadata: jest.fn().mockResolvedValue([metadata]),
});

function setup() {
  const client = {
    provision: jest.fn().mockResolvedValue(CREATED),
    deprovision: jest.fn().mockResolvedValue(undefined),
  };
  const del = jest.fn().mockResolvedValue(undefined);
  const table = jest.fn(() => ({ delete: del }));
  const dataset = jest.fn(() => ({ table }));
  const query = jest.fn();
  const getTables = jest
    .fn()
    .mockResolvedValue([
      [
        listedTable('sales', { type: 'TABLE', numBytes: '0', numRows: '0' }),
        listedTable('daily_view', { type: 'VIEW' }),
        listedTable('holidays', { type: 'TABLE', numBytes: '225', numRows: '8' }),
      ],
    ]);
  const ownDataset = jest.fn(() => ({ getTables }));
  const getAccessToken = jest.fn().mockResolvedValue({ token: 'token' });
  const identity = {
    bigQuery: jest.fn(() => ({ query, dataset: ownDataset })),
    bigQueryAs: jest.fn(() => Promise.resolve({ dataset })),
    impersonate: jest.fn(() => Promise.resolve({ getAccessToken })),
    forget: jest.fn(),
  };
  const engine = new BigQueryManagedStorageEngine(
    client as unknown as OwoxStorageProvisioningClient,
    identity as never
  );
  engine.newShortId = () => 'abcdef012345';
  const sleep = jest.fn((_ms: number) => Promise.resolve());
  engine.sleep = sleep;
  return {
    engine,
    client,
    identity,
    query,
    getTables,
    ownDataset,
    getAccessToken,
    sleep,
    dataset,
    table,
    del,
  };
}

describe('BigQueryManagedStorageEngine', () => {
  afterEach(() => jest.restoreAllMocks());

  it('names the dataset after its location', async () => {
    const { engine, client } = setup();
    await engine.provision({ projectId: 'p1', location: 'US' });

    expect(client.provision).toHaveBeenCalledWith('p1', 'owox_us_abcdef012345', 'US');
  });

  it('asks Integrated Backend for the datasets with a new dataset id', async () => {
    const { engine, client, identity, getAccessToken, sleep } = setup();
    const result = await engine.provision({ projectId: 'p1', location: 'EU' });

    expect(client.provision).toHaveBeenCalledWith('p1', 'owox_eu_abcdef012345', 'EU');
    expect(result).toEqual({ engine: 'bigquery', projectId: 'p1', ...CREATED });
    expect(identity.impersonate).toHaveBeenCalledWith(EMAIL);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  describe('waiting until ODM can use the new account', () => {
    it.each([403, 404])('waits while the token call answers %s, then returns', async status => {
      const { engine, getAccessToken, sleep } = setup();
      getAccessToken
        .mockRejectedValueOnce(googleError(status))
        .mockRejectedValueOnce(googleError(status))
        .mockRejectedValueOnce(googleError(status));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const result = await engine.provision({ projectId: 'p1', location: 'EU' });

      expect(result.serviceAccountEmail).toBe(EMAIL);
      expect(getAccessToken).toHaveBeenCalledTimes(4);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('gives up after about 45 s, logs without the email and still returns', async () => {
      const { engine, client, getAccessToken, sleep } = setup();
      getAccessToken.mockRejectedValue(googleError(403));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const result = await engine.provision({ projectId: 'p1', location: 'EU' });

      expect(result).toEqual({ engine: 'bigquery', projectId: 'p1', ...CREATED });
      const waited = sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0);
      expect(waited).toBeLessThanOrEqual(45_000);
      expect(waited).toBeGreaterThanOrEqual(30_000);
      expect(getAccessToken).toHaveBeenCalledTimes(sleep.mock.calls.length + 1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls.flat().join(' ')).toContain('owox_eu_abcdef012345');
      expect(warn.mock.calls.flat().join(' ')).not.toContain(EMAIL);
      expect(client.deprovision).not.toHaveBeenCalled();
    });

    it.each([
      ['a server error', googleError(500)],
      ['a bad request', googleError(400)],
      ["a failure of ODM's own credentials", new Error('metadata server not ready')],
    ])('does not wait after %s', async (_name, error) => {
      const { engine, getAccessToken, sleep } = setup();
      getAccessToken.mockRejectedValue(error);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(engine.provision({ projectId: 'p1', location: 'EU' })).resolves.toBeDefined();

      expect(getAccessToken).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  it('generates a 12-character hex short id by default', () => {
    expect(new BigQueryManagedStorageEngine({} as never, {} as never).newShortId()).toMatch(
      /^[0-9a-f]{12}$/
    );
  });

  it('deletes what a failed provision may have created and keeps the cause', async () => {
    const { engine, client } = setup();
    const cause = new Error('Integrated Backend answered 502 to OWOX Storage PUT');
    client.provision.mockRejectedValueOnce(cause);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const error = await engine.provision({ projectId: 'p1', location: 'EU' }).catch(e => e);

    expect(error).toBeInstanceOf(OwoxStorageProvisioningException);
    expect((error as Error).cause).toBe(cause);
    expect(client.deprovision).toHaveBeenCalledWith('p1', 'owox_eu_abcdef012345');
    expect(logged.mock.calls.flat().join(' ')).not.toContain(EMAIL);
  });

  it('still throws the provisioning error when the undo fails', async () => {
    const { engine, client } = setup();
    client.provision.mockRejectedValueOnce(new Error('timeout'));
    client.deprovision.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(engine.provision({ projectId: 'p1', location: 'EU' })).rejects.toBeInstanceOf(
      OwoxStorageProvisioningException
    );
  });

  const stored = { engine: 'bigquery' as const, projectId: 'p1', ...CREATED };

  it('restore drops the cached token, deletes leftovers, recreates the storage and waits for it', async () => {
    const { engine, client, identity, getAccessToken } = setup();
    await engine.restore(stored, 'p1', true);

    expect(identity.forget).toHaveBeenCalledWith(EMAIL);
    expect(client.deprovision).toHaveBeenCalledWith('p1', 'owox_eu_abcdef012345');
    expect(client.provision).toHaveBeenCalledWith('p1', 'owox_eu_abcdef012345', 'EU');
    expect(identity.impersonate).toHaveBeenCalledWith(EMAIL);
    const order = [
      identity.forget,
      client.deprovision,
      client.provision,
      identity.impersonate,
      getAccessToken,
    ].map(fn => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('restore deletes nothing when the last deletion finished', async () => {
    const { engine, client } = setup();
    await engine.restore(stored, 'p1', false);

    expect(client.deprovision).not.toHaveBeenCalled();
    expect(client.provision).toHaveBeenCalledWith('p1', 'owox_eu_abcdef012345', 'EU');
  });

  it('restore waits until ODM can use the recreated account', async () => {
    const { engine, getAccessToken, sleep } = setup();
    getAccessToken.mockRejectedValueOnce(googleError(403));

    await engine.restore(stored, 'p1', true);

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('restore does not recreate the storage when deleting the leftovers fails', async () => {
    const { engine, client, identity } = setup();
    client.deprovision.mockRejectedValueOnce(new Error('Integrated Backend answered 503'));
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(engine.restore(stored, 'p1', true)).rejects.toThrow('503');
    expect(client.provision).not.toHaveBeenCalled();
    expect(identity.impersonate).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain('owox_eu_abcdef012345 restore failed');
  });

  it('restore refuses another service account than the stored one', async () => {
    const { engine, client, identity } = setup();
    client.provision.mockResolvedValueOnce({ ...CREATED, serviceAccountEmail: 'other@x.iam' });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(engine.restore(stored, 'p1', true)).rejects.toThrow('another service account');
    expect(identity.impersonate).not.toHaveBeenCalled();
  });

  it('deprovision drops the cached token and asks Integrated Backend to delete the storage', async () => {
    const { engine, client, identity } = setup();
    await engine.deprovision(stored);

    expect(identity.forget).toHaveBeenCalledWith(EMAIL);
    expect(client.deprovision).toHaveBeenCalledWith('p1', 'owox_eu_abcdef012345');
  });

  it('deprovision rejects when Integrated Backend fails', async () => {
    const { engine, client } = setup();
    client.deprovision.mockRejectedValueOnce(new Error('503'));

    await expect(engine.deprovision(stored)).rejects.toThrow('503');
  });

  describe('tables', () => {
    const target = {
      engine: 'bigquery' as const,
      projectId: 'p1',
      gcpProjectId: 'owox-gcp',
      location: 'US' as const,
      datasetId: 'owox_abc',
      internalDatasetId: 'owox_abc_internal',
      serviceAccountEmail: 'owox-st-abc@sa-project.iam.gserviceaccount.com',
    };

    it("lists tables with their metadata as ODM's identity, without a query job", async () => {
      const { engine, identity, query, ownDataset, getTables } = setup();
      const tables = await engine.listTables(target);

      expect(identity.bigQuery).toHaveBeenCalledWith('owox-gcp', 'US');
      expect(ownDataset).toHaveBeenCalledWith('owox_abc');
      expect(getTables).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
      expect(identity.bigQueryAs).not.toHaveBeenCalled();
      expect(tables).toEqual([
        { name: 'daily_view', sizeBytes: 0, rowCount: 0 },
        { name: 'holidays', sizeBytes: 225, rowCount: 8 },
        { name: 'sales', sizeBytes: 0, rowCount: 0 },
      ]);
    });

    it('reads the metadata of every table of a large dataset', async () => {
      const { engine, getTables } = setup();
      const ids = Array.from({ length: 20 }, (_, i) => `t${String(i).padStart(2, '0')}`);
      const listed = ids.map(id => listedTable(id, { numBytes: '1', numRows: '1' }));
      getTables.mockResolvedValueOnce([[...listed].reverse()]);

      const tables = await engine.listTables(target);

      expect(tables.map(t => t.name)).toEqual(ids);
      for (const t of listed) expect(t.getMetadata).toHaveBeenCalledTimes(1);
    });

    it('fails the listing when a table cannot be read', async () => {
      const { engine, getTables } = setup();
      const broken = listedTable('t', {});
      broken.getMetadata.mockRejectedValueOnce(googleError(403));
      getTables.mockResolvedValueOnce([[broken]]);

      await expect(engine.listTables(target)).rejects.toMatchObject({ status: 403 });
    });

    it("drops a listed table as the storage's account", async () => {
      const { engine, identity, dataset, table, del } = setup();
      await engine.dropTable(target, 'holidays');

      expect(identity.bigQueryAs).toHaveBeenCalledWith(
        target.serviceAccountEmail,
        'owox-gcp',
        'US',
        undefined
      );
      expect(dataset).toHaveBeenCalledWith('owox_abc');
      expect(table).toHaveBeenCalledWith('holidays');
      expect(del).toHaveBeenCalledTimes(1);
    });

    it("drops a table with the restored account's client generation", async () => {
      const { engine, identity } = setup();
      await engine.dropTable(target, 'holidays', '1700000000000');

      expect(identity.bigQueryAs).toHaveBeenCalledWith(
        target.serviceAccountEmail,
        'owox-gcp',
        'US',
        '1700000000000'
      );
    });

    it.each(['other', 'owox_other.t', '../owox_abc_internal', 'x/../../datasets/y'])(
      'refuses a name outside the dataset: %s',
      async name => {
        const { engine, identity, del } = setup();
        await expect(engine.dropTable(target, name)).rejects.toBeInstanceOf(NotFoundException);
        expect(identity.bigQueryAs).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
      }
    );
  });
});
