import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { GetModelCanvasEdgesCommand } from '../dto/domain/get-model-canvas-edges.command';
import { ModelCanvasEdgesDto } from '../dto/domain/model-canvas.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class GetModelCanvasEdgesService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataStorageService: DataStorageService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly contextAccessService: ContextAccessService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetModelCanvasEdgesCommand): Promise<ModelCanvasEdgesDto> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    await this.dataStorageService.getByProjectIdAndId(command.projectId, command.storageId);

    const canSee = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.STORAGE,
      command.storageId,
      Action.SEE,
      command.projectId
    );
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this Storage');
    }

    const isAdmin = command.roles.includes('admin');
    const roleScope: RoleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    const [visibleIds, allEdges] = await Promise.all([
      this.dataMartService.findVisibleIdsByProjectIdAndStorageId(
        command.projectId,
        command.storageId,
        { userId: command.userId, roles: command.roles, roleScope }
      ),
      this.relationshipService.findGraphEdgesByStorageId(command.storageId, command.projectId),
    ]);

    const visibleIdSet = new Set(visibleIds);
    const edges = allEdges.filter(
      edge => visibleIdSet.has(edge.sourceDataMartId) && visibleIdSet.has(edge.targetDataMartId)
    );

    return { edges };
  }
}
