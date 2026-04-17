import { Body, Controller, Get, Param, Post, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { CreateInsightTemplateRunTriggerRequestApiDto } from '../dto/presentation/create-insight-template-run-trigger-request-api.dto';
import { InsightTemplateRunResponseApiDto } from '../dto/presentation/insight-template-run-response-api.dto';
import { InsightTemplateRunTriggerListItemResponseApiDto } from '../dto/presentation/insight-template-run-trigger-list-item-response-api.dto';
import { InsightTemplateRunTriggerService } from '../services/insight-template-run-trigger.service';
import {
  CreateInsightTemplateRunTriggerSpec,
  ListInsightTemplateRunTriggersSpec,
} from './spec/insight-template-run-trigger.api';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Controller('data-marts/:dataMartId/insight-templates/:insightTemplateId/run-triggers')
@ApiTags('Insights')
export class InsightTemplateRunTriggerController extends UiTriggerController<InsightTemplateRunResponseApiDto> {
  constructor(
    triggerService: InsightTemplateRunTriggerService,
    private readonly accessDecisionService: AccessDecisionService
  ) {
    super(triggerService);
  }

  @CreateInsightTemplateRunTriggerSpec()
  @Auth(Role.editor(Strategy.PARSE))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string,
    @Body() dto: CreateInsightTemplateRunTriggerRequestApiDto
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
    const triggerId = await (this.triggerService as InsightTemplateRunTriggerService).createTrigger(
      {
        userId: context.userId,
        projectId: context.projectId,
        dataMartId,
        insightTemplateId,
        type: dto.type,
        assistantMessageId: dto.assistantMessageId,
      }
    );

    return { triggerId };
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListInsightTemplateRunTriggersSpec()
  async listInsightTemplateTriggers(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string
  ): Promise<{ data: InsightTemplateRunTriggerListItemResponseApiDto[] }> {
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
    const triggers = await (
      this.triggerService as InsightTemplateRunTriggerService
    ).listByInsightTemplate({
      projectId: context.projectId,
      dataMartId,
      insightTemplateId,
    });

    return {
      data: triggers.map(t => ({
        id: t.id,
        insightTemplateId: t.insightTemplateId,
        status: t.status,
        uiResponse: t.uiResponse ?? null,
        createdAt: t.createdAt,
        modifiedAt: t.modifiedAt,
      })),
    };
  }
}
