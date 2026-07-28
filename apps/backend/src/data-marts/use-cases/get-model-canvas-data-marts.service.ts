import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { GetModelCanvasDataMartsCommand } from '../dto/domain/get-model-canvas-data-marts.command';
import { ModelCanvasDataMartsDto } from '../dto/domain/model-canvas.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { ModelCanvasMapper } from '../mappers/model-canvas.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { DataQualitySummaryService } from '../services/data-quality-summary.service';

const CANVAS_DATA_MARTS_PAGE_SIZE = 1000;

@Injectable()
export class GetModelCanvasDataMartsService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataStorageService: DataStorageService,
    private readonly contextAccessService: ContextAccessService,
    private readonly mapper: ModelCanvasMapper,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly dataQualitySummaryService: DataQualitySummaryService
  ) {}

  async run(command: GetModelCanvasDataMartsCommand): Promise<ModelCanvasDataMartsDto> {
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

    const offset = command.offset ?? 0;
    const { items, total } = await this.dataMartService.findByProjectIdAndStorageIdForCanvas(
      command.projectId,
      command.storageId,
      {
        userId: command.userId,
        roles: command.roles,
        roleScope,
        limit: CANVAS_DATA_MARTS_PAGE_SIZE,
        offset,
      }
    );

    const qualitySummaries = await this.dataQualitySummaryService.getCurrentByDataMarts(
      items,
      command.projectId
    );

    return this.mapper.toDataMartsDto(items, total, offset, qualitySummaries);
  }
}
