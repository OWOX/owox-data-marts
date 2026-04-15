import { Body, Controller, Param, Post, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { InsightArtifactSqlPreviewTriggerResponseApiDto } from '../dto/presentation/insight-artifact-sql-preview-trigger-response-api.dto';
import { RunInsightArtifactSqlPreviewRequestApiDto } from '../dto/presentation/run-insight-artifact-sql-preview-request-api.dto';
import { InsightArtifactSqlPreviewTriggerService } from '../services/insight-artifact-sql-preview-trigger.service';
import { CreateInsightArtifactSqlPreviewTriggerSpec } from './spec/insight-artifact-sql-preview-trigger.api';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Controller('data-marts/:dataMartId/insight-artifacts/:insightArtifactId/sql-preview-triggers')
@ApiTags('Insights')
export class InsightArtifactSqlPreviewTriggerController extends UiTriggerController<InsightArtifactSqlPreviewTriggerResponseApiDto> {
  constructor(
    triggerService: InsightArtifactSqlPreviewTriggerService,
    private readonly accessDecisionService: AccessDecisionService
  ) {
    super(triggerService);
  }

  @CreateInsightArtifactSqlPreviewTriggerSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightArtifactId') insightArtifactId: string,
    @Body() dto?: RunInsightArtifactSqlPreviewRequestApiDto
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
      if (!canEdit) throw new ForbiddenException('You do not have access to this DataMart');
    }

    const triggerId = await (
      this.triggerService as InsightArtifactSqlPreviewTriggerService
    ).createTrigger(context.userId, context.projectId, dataMartId, insightArtifactId, dto?.sql);

    return { triggerId };
  }
}
