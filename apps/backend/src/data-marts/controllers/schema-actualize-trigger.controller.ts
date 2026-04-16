import { Controller, Post, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { SchemaActualizeTriggerService } from '../services/schema-actualize-trigger.service';
import { SchemaActualizeResponseApiDto } from '../dto/presentation/schema-actualize-response-api.dto';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Controller('data-marts/:dataMartId/schema-actualize-triggers')
@ApiTags('DataMarts')
export class SchemaActualizeTriggerController extends UiTriggerController<SchemaActualizeResponseApiDto> {
  constructor(
    triggerService: SchemaActualizeTriggerService,
    private readonly accessDecisionService: AccessDecisionService
  ) {
    super(triggerService);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<{ triggerId: string }> {
    if (context.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.DATA_MART,
        dataMartId,
        Action.EDIT,
        context.projectId
      );
      if (!canEdit)
        throw new ForbiddenException('You do not have permission to edit this DataMart');
    }
    const triggerId = await (this.triggerService as SchemaActualizeTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId
    );
    return { triggerId };
  }
}
