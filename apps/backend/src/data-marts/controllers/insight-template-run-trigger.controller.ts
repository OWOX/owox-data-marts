import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { InsightTemplateRunResponseApiDto } from '../dto/presentation/insight-template-run-response-api.dto';
import { InsightTemplateRunTriggerListItemResponseApiDto } from '../dto/presentation/insight-template-run-trigger-list-item-response-api.dto';
import { InsightTemplateRunTriggerService } from '../services/insight-template-run-trigger.service';
import {
  CreateInsightTemplateRunTriggerSpec,
  ListInsightTemplateRunTriggersSpec,
} from './spec/insight-template-run-trigger.api';

@Controller('data-marts/:dataMartId/insight-templates/:insightTemplateId/run-triggers')
@ApiTags('Insights')
export class InsightTemplateRunTriggerController extends UiTriggerController<InsightTemplateRunResponseApiDto> {
  constructor(triggerService: InsightTemplateRunTriggerService) {
    super(triggerService);
  }

  @CreateInsightTemplateRunTriggerSpec()
  @Auth(Role.editor(Strategy.PARSE))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string
  ): Promise<{ triggerId: string }> {
    const triggerId = await (this.triggerService as InsightTemplateRunTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId,
      insightTemplateId
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
