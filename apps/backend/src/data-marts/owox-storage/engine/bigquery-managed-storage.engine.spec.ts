import { Logger, NotFoundException } from '@nestjs/common';
import { OwoxStorageProvisioningException } from '../owox-storage.exceptions';
import { BigQueryManagedStorageEngine } from './bigquery-managed-storage.engine';
import type { GcpProvisioningClient } from './gcp-provisioning.client';

const EMAIL = 'owox-st-abcdef012345@sa-project.iam.gserviceaccount.com';

function setup() {
  const calls: string[] = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push(name);
      void args;
      return Promise.resolve(result);
    };
  const client = {
    createDataset: jest.fn(record('createDataset')),
    deleteDataset: jest.fn(record('deleteDataset')),
    createServiceAccount: jest.fn(record('createServiceAccount', EMAIL)),
    deleteServiceAccount: jest.fn(record('deleteServiceAccount')),
    grantDatasetWriter: jest.fn(record('grantDatasetWriter')),
    grantProjectRole: jest.fn(record('grantProjectRole')),
    revokeProjectRole: jest.fn(record('revokeProjectRole')),
  };
  const config = {
    getSettings: () => ({ gcpProjectId: 'data-project', serviceAccountProjectId: 'sa-project' }),
  };
  const del = jest.fn().mockResolvedValue(undefined);
  const table = jest.fn(() => ({ delete: del }));
  const dataset = jest.fn(() => ({ table }));
  const query = jest.fn().mockResolvedValue([
    [
      { table_id: 'holidays', size_bytes: '225', row_count: '8' },
      { table_id: 'sales', size_bytes: '0', row_count: '0' },
    ],
  ]);
  const identity = {
    bigQuery: jest.fn(() => ({ query })),
    bigQueryAs: jest.fn(() => Promise.resolve({ dataset })),
  };
  const engine = new BigQueryManagedStorageEngine(
    config as never,
    client as unknown as GcpProvisioningClient,
    identity as never
  );
  const sleeps: number[] = [];
  engine.sleep = ms => {
    sleeps.push(ms);
    return Promise.resolve();
  };
  engine.newShortId = () => 'abcdef012345';
  return { engine, client, calls, sleeps, identity, query, dataset, table, del };
}

describe('BigQueryManagedStorageEngine', () => {
  it('provisions datasets, account and grants with the derived names', async () => {
    const { engine, client } = setup();
    const result = await engine.provision({ projectId: 'p1', location: 'EU' });

    expect(result).toEqual({
      engine: 'bigquery',
      gcpProjectId: 'data-project',
      location: 'EU',
      datasetId: 'owox_abcdef012345',
      internalDatasetId: 'owox_abcdef012345_internal',
      serviceAccountEmail: EMAIL,
    });
    expect(client.createDataset).toHaveBeenNthCalledWith(
      1,
      'data-project',
      'owox_abcdef012345',
      'EU'
    );
    expect(client.createDataset).toHaveBeenNthCalledWith(
      2,
      'data-project',
      'owox_abcdef012345_internal',
      'EU'
    );
    expect(client.createServiceAccount).toHaveBeenCalledWith(
      'sa-project',
      'owox-st-abcdef012345',
      'OWOX Storage for project p1'
    );
    expect(client.grantDatasetWriter).toHaveBeenCalledWith(
      'data-project',
      'owox_abcdef012345',
      EMAIL
    );
    expect(client.grantDatasetWriter).toHaveBeenCalledWith(
      'data-project',
      'owox_abcdef012345_internal',
      EMAIL
    );
    expect(client.grantProjectRole).toHaveBeenCalledWith(
      'data-project',
      'roles/bigquery.jobUser',
      EMAIL
    );
  });

  it('generates a 12-character hex short id by default', () => {
    expect(
      new BigQueryManagedStorageEngine({} as never, {} as never, {} as never).newShortId()
    ).toMatch(/^[0-9a-f]{12}$/);
  });

  const DS = ['deleteDataset:owox_abcdef012345_internal', 'deleteDataset:owox_abcdef012345'];
  const failures: [string, (c: ReturnType<typeof setup>['client']) => void, string[]][] = [
    [
      'the second dataset',
      c =>
        c.createDataset
          .mockImplementationOnce(() => Promise.resolve())
          .mockRejectedValueOnce(new Error('x')),
      DS,
    ],
    [
      'the service account',
      c => c.createServiceAccount.mockRejectedValue(new Error('x')),
      ['deleteServiceAccount', ...DS],
    ],
    [
      'the dataset grant',
      c => c.grantDatasetWriter.mockRejectedValue(new Error('x')),
      ['deleteServiceAccount', ...DS],
    ],
    [
      'the project role grant',
      c => c.grantProjectRole.mockRejectedValue(new Error('x')),
      ['revokeProjectRole', 'deleteServiceAccount', ...DS],
    ],
  ];

  it.each(failures)('undoes the steps in reverse when %s fails', async (_n, fail, undone) => {
    const { engine, client } = setup();
    fail(client);
    const log: string[] = [];
    client.deleteDataset.mockImplementation((_p: unknown, id: unknown) => {
      log.push(`deleteDataset:${String(id)}`);
      return Promise.resolve();
    });
    client.deleteServiceAccount.mockImplementation(() => {
      log.push('deleteServiceAccount');
      return Promise.resolve();
    });
    client.revokeProjectRole.mockImplementation(() => {
      log.push('revokeProjectRole');
      return Promise.resolve();
    });

    await expect(engine.provision({ projectId: 'p1', location: 'US' })).rejects.toBeInstanceOf(
      OwoxStorageProvisioningException
    );
    expect(log).toEqual(undone);
  });

  it('rolls back an account whose create errored, by its derived email', async () => {
    const { engine, client } = setup();
    client.createServiceAccount.mockRejectedValue(new Error('timeout'));
    await expect(engine.provision({ projectId: 'p1', location: 'US' })).rejects.toBeInstanceOf(
      OwoxStorageProvisioningException
    );
    expect(client.deleteServiceAccount).toHaveBeenCalledWith(EMAIL);
  });

  it('logs the failed step and the code, not the email or project ids, and keeps the cause', async () => {
    const { engine, client } = setup();
    const cause = Object.assign(new Error(`denied for ${EMAIL} in data-project`), {
      code: 403,
      response: { data: { error: { status: 'PERMISSION_DENIED' } } },
    });
    client.grantProjectRole.mockRejectedValue(cause);
    const logged: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((m: unknown) => void logged.push(String(m)));

    const error = await engine
      .provision({ projectId: 'p1', location: 'US' })
      .catch((e: unknown) => e);
    spy.mockRestore();

    expect(error).toBeInstanceOf(OwoxStorageProvisioningException);
    expect((error as Error).cause).toBe(cause);
    const line = logged.find(l => l.includes('provisioning failed')) ?? '';
    expect(line).toContain('grantProjectRole');
    expect(line).toContain('403');
    expect(line).toContain('PERMISSION_DENIED');
    expect(line).toContain('abcdef012345');
    for (const l of logged) {
      expect(l).not.toContain(EMAIL);
      expect(l).not.toContain('data-project');
      expect(l).not.toContain('sa-project');
    }
  });

  it('keeps undoing when an undo step fails', async () => {
    const { engine, client } = setup();
    client.createServiceAccount.mockRejectedValue(new Error('x'));
    client.deleteServiceAccount.mockResolvedValue(undefined);
    client.deleteDataset.mockRejectedValueOnce(new Error('y')).mockResolvedValue(undefined);

    await expect(engine.provision({ projectId: 'p1', location: 'US' })).rejects.toBeInstanceOf(
      OwoxStorageProvisioningException
    );
    expect(client.deleteDataset).toHaveBeenCalledTimes(2);
  });

  it('retries a grant until IAM sees the new account', async () => {
    const { engine, client, sleeps } = setup();
    client.grantProjectRole
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValue(undefined);

    await engine.provision({ projectId: 'p1', location: 'US' });
    expect(sleeps).toEqual([2000, 4000]);
    expect(client.grantProjectRole).toHaveBeenCalledTimes(3);
  });

  it('gives up after 5 attempts', async () => {
    const { engine, client, sleeps } = setup();
    client.grantProjectRole.mockRejectedValue(new Error('nope'));

    await expect(engine.provision({ projectId: 'p1', location: 'US' })).rejects.toBeInstanceOf(
      OwoxStorageProvisioningException
    );
    expect(client.grantProjectRole).toHaveBeenCalledTimes(5);
    expect(sleeps).toEqual([2000, 4000, 8000, 16000]);
  });

  it('deprovision ignores resources that are already gone', async () => {
    const { engine, client, calls } = setup();
    await engine.deprovision({
      engine: 'bigquery',
      gcpProjectId: 'data-project',
      location: 'US',
      datasetId: 'owox_abcdef012345',
      internalDatasetId: 'owox_abcdef012345_internal',
      serviceAccountEmail: EMAIL,
    });

    expect(calls).toEqual([
      'revokeProjectRole',
      'deleteServiceAccount',
      'deleteDataset',
      'deleteDataset',
    ]);
    expect(client.revokeProjectRole).toHaveBeenCalledWith(
      'data-project',
      'roles/bigquery.jobUser',
      EMAIL
    );
  });

  it('deprovision attempts every step when one fails, then rejects', async () => {
    const { engine, client } = setup();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const boom = Object.assign(new Error('iam down'), { code: 500 });
    client.revokeProjectRole.mockRejectedValue(boom);
    await expect(
      engine.deprovision({
        engine: 'bigquery',
        gcpProjectId: 'data-project',
        location: 'US',
        datasetId: 'owox_abcdef012345',
        internalDatasetId: 'owox_abcdef012345_internal',
        serviceAccountEmail: EMAIL,
      })
    ).rejects.toBe(boom);
    expect(client.deleteServiceAccount).toHaveBeenCalledWith(EMAIL);
    expect(client.deleteDataset).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[0][0])).toContain('revokeProjectRole');
    log.mockRestore();
  });

  describe('tables', () => {
    const target = {
      engine: 'bigquery' as const,
      gcpProjectId: 'owox-gcp',
      location: 'US' as const,
      datasetId: 'owox_abc',
      internalDatasetId: 'owox_abc_internal',
      serviceAccountEmail: 'owox-st-abc@sa-project.iam.gserviceaccount.com',
    };

    it("lists tables as ODM's identity", async () => {
      const { engine, identity, query } = setup();
      const tables = await engine.listTables(target);

      expect(identity.bigQuery).toHaveBeenCalledWith('owox-gcp', 'US');
      expect(query).toHaveBeenCalledWith({
        query: expect.stringContaining('`owox-gcp.owox_abc.__TABLES__`'),
      });
      expect(identity.bigQueryAs).not.toHaveBeenCalled();
      expect(tables).toEqual([
        { name: 'holidays', sizeBytes: 225, rowCount: 8 },
        { name: 'sales', sizeBytes: 0, rowCount: 0 },
      ]);
    });

    it("drops a listed table as the storage's account", async () => {
      const { engine, identity, dataset, table, del } = setup();
      await engine.dropTable(target, 'holidays');

      expect(identity.bigQueryAs).toHaveBeenCalledWith(
        target.serviceAccountEmail,
        'owox-gcp',
        'US'
      );
      expect(dataset).toHaveBeenCalledWith('owox_abc');
      expect(table).toHaveBeenCalledWith('holidays');
      expect(del).toHaveBeenCalledTimes(1);
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
