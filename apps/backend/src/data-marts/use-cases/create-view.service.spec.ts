import { CreateViewService } from './create-view.service';
import { CreateViewCommand } from '../dto/domain/create-view.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('CreateViewService', () => {
  const baseDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definition: { sqlQuery: 'SELECT 1' },
  };

  const createService = (storage: Record<string, unknown>) => {
    const dataMart = { ...baseDataMart, storage };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const createViewExecutorFacade = {
      createView: jest.fn().mockResolvedValue({ fullyQualifiedName: 'view_name' }),
    };
    const credentialsResolver = {
      hasCredentials: jest.fn(async (s: { credentialId?: string | null }) => !!s.credentialId),
      resolve: jest.fn().mockResolvedValue({}),
    };

    const service = new CreateViewService(
      dataMartService as never,
      createViewExecutorFacade as never,
      credentialsResolver as never
    );

    return { service, dataMartService, createViewExecutorFacade, credentialsResolver, dataMart };
  };

  const command = () => new CreateViewCommand('dm-1', 'proj-1', 'view_name');

  it('creates the view when credentials are present', async () => {
    const { service, createViewExecutorFacade } = createService({
      id: 'st-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p' },
      credentialId: 'cred-1',
    });

    const result = await service.run(command());

    expect(result).toEqual({ fullyQualifiedName: 'view_name' });
    expect(createViewExecutorFacade.createView).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      {},
      { projectId: 'p' },
      'view_name',
      'SELECT 1'
    );
  });

  it('still rejects a credential-less non-DuckDB storage', async () => {
    const { service } = createService({
      id: 'st-2',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'p' },
      credentialId: null,
    });

    await expect(service.run(command())).rejects.toThrow('Storage setup is not finished.');
  });

  it('creates the view for a credential-less DuckDB storage (no "setup not finished")', async () => {
    const { service, createViewExecutorFacade } = createService({
      id: 'st-3',
      type: DataStorageType.DUCKDB,
      config: {},
      credentialId: null,
    });

    const result = await service.run(command());

    expect(result).toEqual({ fullyQualifiedName: 'view_name' });
    expect(createViewExecutorFacade.createView).toHaveBeenCalledWith(
      DataStorageType.DUCKDB,
      {},
      {},
      'view_name',
      'SELECT 1'
    );
  });
});
