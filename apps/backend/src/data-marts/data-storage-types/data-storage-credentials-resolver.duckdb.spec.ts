import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DataStorageCredentialsResolver } from './data-storage-credentials-resolver.service';
import { StorageCredentialBindingService } from './storage-credential-binding.service';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageType } from './enums/data-storage-type.enum';

describe('DataStorageCredentialsResolver DuckDB', () => {
  let resolver: DataStorageCredentialsResolver;
  let storageCredentials: { resolveForStorage: jest.Mock };
  let legacy: { resolve: jest.Mock };

  beforeEach(() => {
    storageCredentials = { resolveForStorage: jest.fn() };
    legacy = { resolve: jest.fn() };
    resolver = new DataStorageCredentialsResolver(
      { findOne: jest.fn() } as unknown as Repository<DataStorage>,
      storageCredentials as unknown as StorageCredentialBindingService,
      legacy as unknown as LegacyStorageCredentialReader,
      new ConfigService({ DUCKDB_DATA_DIR: 'data/duck' })
    );
  });

  it('returns the absolute path of the storage file, without a Credential', async () => {
    const storage = { id: 's1', type: DataStorageType.DUCKDB, credentialId: null } as DataStorage;

    const res = await resolver.resolve(storage);

    expect(res).toEqual({ databasePath: path.resolve('data/duck', 's1.duckdb') });
    expect(storageCredentials.resolveForStorage).not.toHaveBeenCalled();
    expect(legacy.resolve).not.toHaveBeenCalled();
  });

  it('ignores a stale credentialId on a DuckDB storage', async () => {
    const storage = {
      id: 's1',
      type: DataStorageType.DUCKDB,
      credentialId: 'some-stale-cred-id',
      credential: null,
    } as unknown as DataStorage;

    const res = await resolver.resolve(storage);

    expect(res).toEqual({ databasePath: path.resolve('data/duck', 's1.duckdb') });
    expect(legacy.resolve).not.toHaveBeenCalled();
  });
});
