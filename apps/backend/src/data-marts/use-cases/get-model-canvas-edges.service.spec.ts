import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DataMartRelationshipGraphEdgeDto } from '../dto/domain/data-mart-relationship-graph-edge.dto';
import { GetModelCanvasEdgesCommand } from '../dto/domain/get-model-canvas-edges.command';
import { RoleScope } from '../enums/role-scope.enum';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { GetModelCanvasEdgesService } from './get-model-canvas-edges.service';

describe('GetModelCanvasEdgesService', () => {
  const dataMartService = { findVisibleIdsByProjectIdAndStorageId: jest.fn() };
  const dataStorageService = { getByProjectIdAndId: jest.fn() };
  const relationshipService = { findGraphEdgesByStorageId: jest.fn() };
  const contextAccessService = { getRoleScope: jest.fn() };
  const accessDecisionService = {
    canAccess: jest.fn(),
    canAccessMany: jest.fn(),
  };

  const service = new GetModelCanvasEdgesService(
    dataMartService as unknown as DataMartService,
    dataStorageService as unknown as DataStorageService,
    relationshipService as unknown as DataMartRelationshipService,
    contextAccessService as unknown as ContextAccessService,
    accessDecisionService as unknown as AccessDecisionService
  );

  const command = new GetModelCanvasEdgesCommand('project-1', 'user-1', ['editor'], 'storage-1');

  const edge = (id: string, sourceId: string, targetId: string) =>
    new DataMartRelationshipGraphEdgeDto(id, sourceId, targetId, [
      { sourceFieldName: 'a', targetFieldName: 'b' },
    ]);

  beforeEach(() => {
    jest.resetAllMocks();
    dataStorageService.getByProjectIdAndId.mockResolvedValue({ id: 'storage-1' });
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
    accessDecisionService.canAccess.mockResolvedValue(true);
    accessDecisionService.canAccessMany.mockResolvedValue(new Map());
    dataMartService.findVisibleIdsByProjectIdAndStorageId.mockResolvedValue([]);
    relationshipService.findGraphEdgesByStorageId.mockResolvedValue([]);
  });

  it('throws when userId is missing', async () => {
    const anonymous = new GetModelCanvasEdgesCommand('project-1', '', ['editor'], 'storage-1');
    await expect(service.run(anonymous)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates that the storage belongs to the project', async () => {
    dataStorageService.getByProjectIdAndId.mockRejectedValue(new Error('not found'));
    await expect(service.run(command)).rejects.toThrow('not found');
    expect(dataStorageService.getByProjectIdAndId).toHaveBeenCalledWith('project-1', 'storage-1');
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });

  it('rejects storage access before querying role scope or graph data', async () => {
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
    expect(dataMartService.findVisibleIdsByProjectIdAndStorageId).not.toHaveBeenCalled();
    expect(relationshipService.findGraphEdgesByStorageId).not.toHaveBeenCalled();
  });

  it('keeps an edge when both ends are visible', async () => {
    dataMartService.findVisibleIdsByProjectIdAndStorageId.mockResolvedValue(['a', 'b']);
    relationshipService.findGraphEdgesByStorageId.mockResolvedValue([edge('e1', 'a', 'b')]);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.STORAGE,
      'storage-1',
      Action.SEE,
      'project-1'
    );
    expect(result.edges.map(e => e.id)).toEqual(['e1']);
    expect(relationshipService.findGraphEdgesByStorageId).toHaveBeenCalledWith(
      'storage-1',
      'project-1'
    );
  });

  it('drops an edge when the target data mart is not visible', async () => {
    dataMartService.findVisibleIdsByProjectIdAndStorageId.mockResolvedValue(['a']);
    relationshipService.findGraphEdgesByStorageId.mockResolvedValue([edge('e1', 'a', 'hidden')]);

    const result = await service.run(command);

    expect(result.edges).toEqual([]);
  });

  it('drops an edge when the source data mart is not visible', async () => {
    dataMartService.findVisibleIdsByProjectIdAndStorageId.mockResolvedValue(['b']);
    relationshipService.findGraphEdgesByStorageId.mockResolvedValue([edge('e1', 'hidden', 'b')]);

    const result = await service.run(command);

    expect(result.edges).toEqual([]);
  });

  it('resolves role scope for non-admins and skips the lookup for admins', async () => {
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    await service.run(command);
    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(dataMartService.findVisibleIdsByProjectIdAndStorageId).toHaveBeenCalledWith(
      'project-1',
      'storage-1',
      {
        userId: 'user-1',
        roles: ['editor'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
      }
    );

    jest.resetAllMocks();
    dataStorageService.getByProjectIdAndId.mockResolvedValue({ id: 'storage-1' });
    accessDecisionService.canAccess.mockResolvedValue(true);
    dataMartService.findVisibleIdsByProjectIdAndStorageId.mockResolvedValue([]);
    relationshipService.findGraphEdgesByStorageId.mockResolvedValue([]);

    const admin = new GetModelCanvasEdgesCommand('project-1', 'user-1', ['admin'], 'storage-1');
    await service.run(admin);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(dataMartService.findVisibleIdsByProjectIdAndStorageId).toHaveBeenCalledWith(
      'project-1',
      'storage-1',
      {
        userId: 'user-1',
        roles: ['admin'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      }
    );
  });
});
