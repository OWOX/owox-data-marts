import type { Repository } from 'typeorm';
import { DataStorageCredentialsResolver } from './data-storage-credentials-resolver.service';
import type { DataStorage } from '../entities/data-storage.entity';
import type { ManagedStorage } from '../entities/managed-storage.entity';

const record = (storageId: string, email: string) =>
  ({
    storageId,
    serviceAccountEmail: email,
    datasetId: `ds_${storageId}`,
    internalDatasetId: `ds_${storageId}_internal`,
    modifiedAt: new Date(1700000000000),
  }) as ManagedStorage;

describe('DataStorageCredentialsResolver (managed storage)', () => {
  const records = new Map([
    ['a', record('a', 'a@x.iam')],
    ['b', record('b', 'b@x.iam')],
  ]);
  const managed = { findByStorageId: jest.fn(async (id: string) => records.get(id) ?? null) };
  const identity = {
    impersonate: jest.fn(async (email: string, _generation?: string) => ({ email })),
  };
  const budget = { remainingBytes: jest.fn() };
  const binding = { resolveForStorage: jest.fn(), findBoundStorageIds: jest.fn() };
  const legacy = { resolve: jest.fn(), hasOldKey: jest.fn() };
  const resolver = new DataStorageCredentialsResolver(
    {} as Repository<DataStorage>,
    binding as never,
    legacy as never,
    managed as never,
    identity as never,
    { forStorage: jest.fn().mockReturnValue(budget) }
  );

  beforeEach(() => jest.clearAllMocks());

  it('resolves a managed storage to impersonated credentials without a Credential lookup', async () => {
    const result = await resolver.resolve({ id: 'a' } as DataStorage);
    expect(result).toMatchObject({
      type: 'bigquery_managed',
      serviceAccountEmail: 'a@x.iam',
      datasetId: 'ds_a',
      internalDatasetId: 'ds_a_internal',
      scanBudget: budget,
    });
    expect(result).toHaveProperty('authClient', await identity.impersonate.mock.results[0].value);
    expect(identity.impersonate).toHaveBeenCalledWith('a@x.iam', '1700000000000');
    expect(binding.resolveForStorage).not.toHaveBeenCalled();
    expect(legacy.resolve).not.toHaveBeenCalled();
  });

  it('resolves each managed storage to its own account', async () => {
    const result = await resolver.resolve({ id: 'b' } as DataStorage);
    expect(identity.impersonate).toHaveBeenCalledWith('b@x.iam', '1700000000000');
    expect(result).toMatchObject({ serviceAccountEmail: 'b@x.iam' });
  });

  it('hasCredentials is true for a managed storage', async () => {
    await expect(resolver.hasCredentials({ id: 'a' } as DataStorage)).resolves.toBe(true);
    expect(binding.findBoundStorageIds).not.toHaveBeenCalled();
  });
});
