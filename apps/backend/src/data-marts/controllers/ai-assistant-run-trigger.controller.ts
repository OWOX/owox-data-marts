import { Controller, Get, Param, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { AiRunTriggerResponseApiDto } from '../dto/presentation/ai-run-trigger-response-api.dto';
import { AiAssistantRunTriggerListItemResponseApiDto } from '../dto/presentation/ai-assistant-run-trigger-list-item-response-api.dto';
import { ListAiAssistantRunTriggersQueryApiDto } from '../dto/presentation/list-ai-assistant-run-triggers-query-api.dto';
import { AiAssistantRunTriggerMapper } from '../mappers/ai-assistant-run-trigger.mapper';
import { AiAssistantRunTriggerService } from '../services/ai-assistant-run-trigger.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Controller('data-marts/:dataMartId/ai-assistant/run-triggers')
@ApiTags('Insights')
export class AiAssistantRunTriggerController extends UiTriggerController<AiRunTriggerResponseApiDto> {
  constructor(
    triggerService: AiAssistantRunTriggerService,
    private readonly mapper: AiAssistantRunTriggerMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {
    super(triggerService);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  async listAiAssistantTriggers(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Query() query: ListAiAssistantRunTriggersQueryApiDto
  ): Promise<{ data: AiAssistantRunTriggerListItemResponseApiDto[] }> {
    if (context.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.DATA_MART,
        dataMartId,
        Action.SEE,
        context.projectId
      );
      if (!canSee) throw new ForbiddenException('You do not have access to this DataMart');
    }
    const triggers = await (this.triggerService as AiAssistantRunTriggerService).listBySession({
      userId: context.userId,
      projectId: context.projectId,
      dataMartId,
      sessionId: query.sessionId,
    });

    return {
      data: this.mapper.toListItemResponseList(triggers),
    };
  }
}
