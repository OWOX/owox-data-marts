import { CreateViewExecutorFacade } from '../data-storage-types/facades/create-view-executor.facade';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { CreateViewService } from './create-view.service';

describe('CreateViewService', () => {
  const dataMartService = {
    getByIdAndProjectId: jest.fn(),
  };
  const createViewExecutor = {
    createView: jest.fn(),
  };
  const credentialsResolver = {
    resolve: jest.fn(),
  };
  const dataStorageService = {
    getByProjectIdAndId: jest.fn(),
  };
  const service = new CreateViewService(
    dataMartService as unknown as DataMartService,
    createViewExecutor as unknown as CreateViewExecutorFacade,
    credentialsResolver as unknown as DataStorageCredentialsResolver,
    dataStorageService as unknown as DataStorageService
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates a snapshot view from the saved SQL and matching saved storage identity', async () => {
    const storage = {
      id: 'storage-1',
      projectId: 'project-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'warehouse-project' },
      credentialId: 'credential-1',
    };
    const credentials = { type: 'service-account' };
    dataStorageService.getByProjectIdAndId.mockResolvedValue(storage);
    credentialsResolver.resolve.mockResolvedValue(credentials);
    createViewExecutor.createView.mockResolvedValue({
      fullyQualifiedName: 'warehouse.internal.dq_run_source',
    });

    await expect(
      service.runFromSnapshot({
        projectId: 'project-1',
        storageId: 'storage-1',
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        viewName: 'dq_run_source',
        sql: 'SELECT saved_value FROM saved_source',
      })
    ).resolves.toEqual({
      fullyQualifiedName: 'warehouse.internal.dq_run_source',
    });

    expect(dataStorageService.getByProjectIdAndId).toHaveBeenCalledWith('project-1', 'storage-1');
    expect(createViewExecutor.createView).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      credentials,
      storage.config,
      'dq_run_source',
      'SELECT saved_value FROM saved_source',
      { requireFullyQualifiedName: true }
    );
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('rejects a changed storage type before resolving credentials', async () => {
    dataStorageService.getByProjectIdAndId.mockResolvedValue({
      id: 'storage-1',
      projectId: 'project-1',
      type: DataStorageType.SNOWFLAKE,
      config: { account: 'account' },
      credentialId: 'credential-1',
    });

    await expect(
      service.runFromSnapshot({
        projectId: 'project-1',
        storageId: 'storage-1',
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        viewName: 'dq_run_source',
        sql: 'SELECT 1',
      })
    ).rejects.toThrow('Data Storage type changed after the run was queued');

    expect(credentialsResolver.resolve).not.toHaveBeenCalled();
    expect(createViewExecutor.createView).not.toHaveBeenCalled();
  });
});
