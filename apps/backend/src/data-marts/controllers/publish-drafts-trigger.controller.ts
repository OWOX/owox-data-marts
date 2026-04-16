import { Controller, Post, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { PublishDraftsTriggerService } from '../services/publish-drafts-trigger.service';
import { PublishDataStorageDraftsResponseApiDto } from '../dto/presentation/publish-data-storage-drafts-response-api.dto';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Controller('data-storages/:dataStorageId/publish-drafts-triggers')
@ApiTags('DataStorages')
export class PublishDraftsTriggerController extends UiTriggerController<PublishDataStorageDraftsResponseApiDto> {
  constructor(
    triggerService: PublishDraftsTriggerService,
    private readonly accessDecisionService: AccessDecisionService
  ) {
    super(triggerService);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataStorageId') dataStorageId: string
  ): Promise<{ triggerId: string }> {
    if (context.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.STORAGE,
        dataStorageId,
        Action.EDIT,
        context.projectId
      );
      if (!canEdit) throw new ForbiddenException('You do not have access to this Storage');
    }

    const triggerId = await (this.triggerService as PublishDraftsTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataStorageId
    );
    return { triggerId };
  }
}
