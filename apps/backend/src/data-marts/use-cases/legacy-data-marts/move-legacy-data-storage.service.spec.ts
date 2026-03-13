import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataStorage } from '../../entities/data-storage.entity';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { MoveLegacyDataStorageService } from './move-legacy-data-storage.service';

describe('MoveLegacyDataStorageService', () => {
  let service: MoveLegacyDataStorageService;
  let legacyDataStorageService: jest.Mocked<LegacyDataStorageService>;
  let dataSource: jest.Mocked<DataSource>;
  let mockQueryBuilder: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    legacyDataStorageService = {
      validateSyncPermissionForProject: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataStorageService>;

    const mockSubQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT "id" FROM "data_mart" "dm")'),
    };

    mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation((conditionOrFn, _params) => {
        if (typeof conditionOrFn === 'function') {
          conditionOrFn(mockQueryBuilder);
        }
        return mockQueryBuilder;
      }),
      subQuery: jest.fn().mockReturnValue(mockSubQueryBuilder),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockManager = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      save: jest.fn().mockImplementation(async entity => entity),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async cb => cb(mockManager)),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoveLegacyDataStorageService,
        { provide: LegacyDataStorageService, useValue: legacyDataStorageService },
        { provide: DataSource, useValue: dataSource },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    })
      .setLogger(new Logger()) // disable error logging in console
      .compile();

    service = module.get<MoveLegacyDataStorageService>(MoveLegacyDataStorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate permission, clean up non-movable entities by storage directly, and update projectId for data marts and storage within a transaction', async () => {
    // Arrange
    const storage = { id: 'st1', projectId: 'old_project' } as DataStorage;
    const newProjectId = 'new_project';

    // Act
    const result = await service.run(storage, newProjectId);

    // Assert
    expect(legacyDataStorageService.validateSyncPermissionForProject).toHaveBeenCalledWith(
      newProjectId
    );
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(storage.projectId).toBe(newProjectId);
    expect(result.projectId).toBe(newProjectId);
  });

  it('should perform 3 delete queries and 1 update query inside transaction', async () => {
    // Arrange
    const storage = { id: 'st1', projectId: 'old_project' } as DataStorage;

    // Act
    await service.run(storage, 'new_project');

    // Assert: 3 deletes (reports, triggers, runs) + 1 update (data marts) + 1 save (storage)
    expect(mockQueryBuilder.execute).toHaveBeenCalledTimes(4);
    expect(mockQueryBuilder.delete).toHaveBeenCalledTimes(3);
    expect(mockQueryBuilder.update).toHaveBeenCalledTimes(1);
    expect(mockManager.save).toHaveBeenCalledTimes(1);
  });

  it('should use subquery builder in where conditions', async () => {
    // Arrange
    const storage = { id: 'st1', projectId: 'old_project' } as DataStorage;

    // Act
    await service.run(storage, 'new_project');

    // Assert: subQuery() called once (reused for all deletes)
    expect(mockQueryBuilder.subQuery).toHaveBeenCalledTimes(1);
  });

  it('should throw and not start transaction if validateSyncPermissionForProject throws', async () => {
    // Arrange
    const storage = { id: 'st1', projectId: 'old_project' } as DataStorage;
    const permissionError = new Error('No sync permission');
    legacyDataStorageService.validateSyncPermissionForProject.mockImplementation(() => {
      throw permissionError;
    });

    // Act & Assert
    await expect(service.run(storage, 'new_project')).rejects.toThrow(permissionError);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('should propagate error and not update storage projectId if transaction fails', async () => {
    // Arrange
    const storage = { id: 'st1', projectId: 'old_project' } as DataStorage;
    const dbError = new Error('DB connection lost');
    dataSource.transaction.mockRejectedValue(dbError);

    // Act & Assert
    await expect(service.run(storage, 'new_project')).rejects.toThrow(dbError);
    expect(storage.projectId).toBe('old_project');
  });

  it('should update credential projectId and save credential when storage has a credential', async () => {
    // Arrange
    const credential = { id: 'cred1', projectId: 'old_project' };
    const storage = {
      id: 'st1',
      projectId: 'old_project',
      credential,
    } as DataStorage;
    const newProjectId = 'new_project';

    // Act
    const result = await service.run(storage, newProjectId);

    // Assert
    expect(credential.projectId).toBe(newProjectId);
    expect(mockManager.save).toHaveBeenCalledTimes(2);
    expect(mockManager.save).toHaveBeenCalledWith(credential);
    expect(mockManager.save).toHaveBeenCalledWith(storage);
    expect(result.projectId).toBe(newProjectId);
  });

  it('should not save credential when storage.credential is null', async () => {
    // Arrange
    const storage = {
      id: 'st1',
      projectId: 'old_project',
      credential: null,
    } as DataStorage;

    // Act
    await service.run(storage, 'new_project');

    // Assert: only 1 save call (for storage), no save for credential
    expect(mockManager.save).toHaveBeenCalledTimes(1);
    expect(mockManager.save).toHaveBeenCalledWith(storage);
  });
});
