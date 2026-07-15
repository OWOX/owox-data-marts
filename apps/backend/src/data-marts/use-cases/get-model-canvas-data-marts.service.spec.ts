import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GetModelCanvasDataMartsCommand } from '../dto/domain/get-model-canvas-data-marts.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { ModelCanvasMapper } from '../mappers/model-canvas.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { DataMart } from '../entities/data-mart.entity';
import { GetModelCanvasDataMartsService } from './get-model-canvas-data-marts.service';

describe('GetModelCanvasDataMartsService', () => {
  const dataMartService = { findByProjectIdAndStorageIdForCanvas: jest.fn() };
  const dataStorageService = { getByProjectIdAndId: jest.fn() };
  const contextAccessService = { getRoleScope: jest.fn() };
  const accessDecisionService = {
    canAccess: jest.fn(),
    canAccessMany: jest.fn(),
  };

  const service = new GetModelCanvasDataMartsService(
    dataMartService as unknown as DataMartService,
    dataStorageService as unknown as DataStorageService,
    contextAccessService as unknown as ContextAccessService,
    new ModelCanvasMapper(),
    accessDecisionService as unknown as AccessDecisionService
  );

  const command = new GetModelCanvasDataMartsCommand(
    'project-1',
    'user-1',
    ['editor'],
    'storage-1',
    10
  );

  const dm = (id: string, overrides: Partial<DataMart> = {}): DataMart =>
    ({
      id,
      title: `DM ${id}`,
      status: DataMartStatus.PUBLISHED,
      description: null,
      schema: undefined,
      ...overrides,
    }) as DataMart;

  beforeEach(() => {
    jest.resetAllMocks();
    dataStorageService.getByProjectIdAndId.mockResolvedValue({ id: 'storage-1' });
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
    accessDecisionService.canAccess.mockResolvedValue(true);
    accessDecisionService.canAccessMany.mockResolvedValue(new Map());
    dataMartService.findByProjectIdAndStorageIdForCanvas.mockResolvedValue({
      items: [],
      total: 0,
    });
  });

  it('throws when userId is missing', async () => {
    const anonymous = new GetModelCanvasDataMartsCommand('project-1', '', ['editor'], 'storage-1');
    await expect(service.run(anonymous)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates that the storage belongs to the project', async () => {
    dataStorageService.getByProjectIdAndId.mockRejectedValue(new Error('not found'));
    await expect(service.run(command)).rejects.toThrow('not found');
    expect(dataStorageService.getByProjectIdAndId).toHaveBeenCalledWith('project-1', 'storage-1');
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });

  it('rejects storage access before querying role scope or data marts', async () => {
    accessDecisionService.canAccess.mockResolvedValue(false);

    await expect(service.run(command)).rejects.toThrow(
      new ForbiddenException('You do not have access to this Storage')
    );

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.STORAGE,
      'storage-1',
      Action.SEE,
      'project-1'
    );
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(dataMartService.findByProjectIdAndStorageIdForCanvas).not.toHaveBeenCalled();
  });

  it('maps data marts to nodes with fieldCount from schema', async () => {
    dataMartService.findByProjectIdAndStorageIdForCanvas.mockResolvedValue({
      items: [
        dm('a', { schema: { fields: [{}, {}, {}] } as never, description: 'desc' }),
        dm('b', { status: DataMartStatus.DRAFT }),
      ],
      total: 2,
    });

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.STORAGE,
      'storage-1',
      Action.SEE,
      'project-1'
    );
    expect(result.items).toEqual([
      {
        id: 'a',
        title: 'DM a',
        status: DataMartStatus.PUBLISHED,
        description: 'desc',
        fieldCount: 3,
      },
      { id: 'b', title: 'DM b', status: DataMartStatus.DRAFT, description: null, fieldCount: 0 },
    ]);
  });

  it('forwards pagination and returns total/offset from the domain query', async () => {
    dataMartService.findByProjectIdAndStorageIdForCanvas.mockResolvedValue({
      items: [dm('a')],
      total: 42,
    });

    const result = await service.run(command);

    expect(dataMartService.findByProjectIdAndStorageIdForCanvas).toHaveBeenCalledWith(
      'project-1',
      'storage-1',
      {
        userId: 'user-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
        limit: 1000,
        offset: 10,
      }
    );
    expect(result.total).toBe(42);
    expect(result.offset).toBe(10);
  });

  it('defaults offset to 0 when not provided', async () => {
    const noOffset = new GetModelCanvasDataMartsCommand(
      'project-1',
      'user-1',
      ['editor'],
      'storage-1'
    );

    const result = await service.run(noOffset);

    expect(dataMartService.findByProjectIdAndStorageIdForCanvas).toHaveBeenCalledWith(
      'project-1',
      'storage-1',
      expect.objectContaining({ offset: 0 })
    );
    expect(result.offset).toBe(0);
  });

  it('resolves role scope for non-admins and skips the lookup for admins', async () => {
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    await service.run(command);
    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(dataMartService.findByProjectIdAndStorageIdForCanvas).toHaveBeenCalledWith(
      'project-1',
      'storage-1',
      {
        userId: 'user-1',
        roles: ['editor'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
        limit: 1000,
        offset: 10,
      }
    );

    jest.resetAllMocks();
    dataStorageService.getByProjectIdAndId.mockResolvedValue({ id: 'storage-1' });
    accessDecisionService.canAccess.mockResolvedValue(true);
    dataMartService.findByProjectIdAndStorageIdForCanvas.mockResolvedValue({
      items: [],
      total: 0,
    });

    const admin = new GetModelCanvasDataMartsCommand(
      'project-1',
      'user-1',
      ['admin'],
      'storage-1',
      10
    );
    await service.run(admin);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(dataMartService.findByProjectIdAndStorageIdForCanvas).toHaveBeenCalledWith(
      'project-1',
      'storage-1',
      {
        userId: 'user-1',
        roles: ['admin'],
        roleScope: RoleScope.ENTIRE_PROJECT,
        limit: 1000,
        offset: 10,
      }
    );
  });
});
