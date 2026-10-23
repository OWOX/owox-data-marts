import { ValidateDataStorageAccessService } from './validate-data-storage-access.service';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  ValidationResult,
  ValidationResultCode,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';

describe('ValidateDataStorageAccessService', () => {
  const createService = (storage: Record<string, unknown>) => {
    const dataStorageService = { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) };
    const facade = { validateAccess: jest.fn().mockResolvedValue(ValidationResult.success()) };
    const credentialsResolver = { resolve: jest.fn().mockResolvedValue({}) };
    const accessDecisionService = { canAccess: jest.fn() };

    const service = new ValidateDataStorageAccessService(
      dataStorageService as never,
      facade as never,
      credentialsResolver as never,
      accessDecisionService as never
    );

    return { service, facade, credentialsResolver };
  };

  const command = () => new ValidateDataStorageAccessCommand('st-1', 'proj-1');

  it('returns the DuckDB access validator result for a configured DuckDB storage', async () => {
    const storage = { id: 'st-1', type: DataStorageType.DUCKDB, config: {}, credentialId: null };
    const { service, facade, credentialsResolver } = createService(storage);
    credentialsResolver.resolve.mockResolvedValue({ databasePath: '/data/duckdb/st-1.duckdb' });

    const result = await service.run(command());

    expect(result.valid).toBe(true);
    expect(credentialsResolver.resolve).toHaveBeenCalledWith(storage);
    expect(facade.validateAccess).toHaveBeenCalledWith(
      DataStorageType.DUCKDB,
      {},
      {
        databasePath: '/data/duckdb/st-1.duckdb',
      }
    );
  });

  it('reports a DuckDB storage without config as unconfigured', async () => {
    const { service, facade } = createService({
      id: 'st-1',
      type: DataStorageType.DUCKDB,
      config: null,
      credentialId: null,
    });

    const result = await service.run(command());

    expect(result.code).toBe(ValidationResultCode.UNCONFIGURED);
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });

  it('reports a credential-less non-DuckDB storage as unconfigured', async () => {
    const { service, facade } = createService({
      id: 'st-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p', location: 'US' },
      credentialId: null,
    });

    const result = await service.run(command());

    expect(result.code).toBe(ValidationResultCode.UNCONFIGURED);
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });
});
