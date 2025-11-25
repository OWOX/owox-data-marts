import { Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { InsightRunResponseApiDto } from '../dto/presentation/insight-run-response-api.dto';
import { InsightRunTriggerService } from '../services/insight-run-trigger.service';
import { CreateInsightRunTriggerSpec } from './spec/insight-run-trigger.api';

@Controller('data-marts/:dataMartId/insights/:insightId/run-triggers')
@ApiTags('DataMarts')
export class InsightRunTriggerController extends UiTriggerController<InsightRunResponseApiDto> {
  constructor(triggerService: InsightRunTriggerService) {
    super(triggerService);
  }

  @CreateInsightRunTriggerSpec()
  @Auth(Role.editor(Strategy.PARSE))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightId') insightId: string
  ): Promise<{ triggerId: string }> {
    const triggerId = await (this.triggerService as InsightRunTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId,
      insightId
    );
    return { triggerId };
  }
}
