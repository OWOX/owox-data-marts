import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DataStorageCredentialsResolver } from './data-storage-credentials-resolver.service';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageType } from './enums/data-storage-type.enum';

describe('DataStorageCredentialsResolver DuckDB', () => {
  let resolver: DataStorageCredentialsResolver;
  let credentialService: jest.Mocked<Pick<DataStorageCredentialService, 'getById'>>;

  beforeEach(() => {
    credentialService = { getById: jest.fn() };
    const config = new ConfigService({ DUCKDB_DATA_DIR: 'data/duck' });
    resolver = new DataStorageCredentialsResolver(
      { getStorageOAuth2Client: jest.fn() } as unknown as GoogleOAuthClientService,
      { findOne: jest.fn() } as unknown as Repository<DataStorage>,
      credentialService as unknown as DataStorageCredentialService,
      config
    );
  });

  it('returns the absolute path of the storage file, without a stored credential', async () => {
    const storage = { id: 's1', type: DataStorageType.DUCKDB, credentialId: null } as DataStorage;

    const res = await resolver.resolve(storage);

    expect(res).toEqual({ databasePath: path.resolve('data/duck', 's1.duckdb') });
    expect(credentialService.getById).not.toHaveBeenCalled();
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
    expect(credentialService.getById).not.toHaveBeenCalled();
  });
});
