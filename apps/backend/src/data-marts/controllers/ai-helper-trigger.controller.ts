import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { AiInsightsConfigService } from '../../common/ai-insights/services/ai-insights-config.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { AiHelperTriggerService } from '../services/ai-helper-trigger.service';
import { AiHelperUiResponse } from '../entities/ai-helper-trigger.entity';
import { CreateAiHelperTriggerRequestApiDto } from '../dto/presentation/create-ai-helper-trigger-request-api.dto';
import {
  CancelAiHelperTriggerSpec,
  CreateAiHelperTriggerSpec,
  GetAiHelperTriggerResponseSpec,
  GetAiHelperTriggerStatusSpec,
} from './spec/ai-helper-trigger.api';

/**
 * Controller for AI helper triggers.
 *
 * AI metadata generation runs asynchronously because the upstream ingress drops
 * idle connections at ~30s while LLM responses routinely exceed that — the POST
 * here accepts the request and kicks off background processing, and clients
 * poll for the result.
 *
 * Lifecycle endpoints inherited from `UiTriggerController`:
 * - GET    /:triggerId/status — Get trigger status
 * - GET    /:triggerId         — Get trigger response (result)
 * - DELETE /:triggerId         — Cancel/abort trigger
 *
 * They are overridden below only to attach Swagger specs and adjust auth strategy.
 */
@Controller('data-marts/:dataMartId/ai-helper/triggers')
@ApiTags('DataMarts')
export class AiHelperTriggerController extends UiTriggerController<AiHelperUiResponse> {
  constructor(
    triggerService: AiHelperTriggerService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly aiInsightsConfig: AiInsightsConfigService
  ) {
    super(triggerService);
  }

  /**
   * Create a new AI helper trigger.
   *
   * Performs cheap up-front gates here (BYOK availability, access check) so the user
   * sees them as immediate HTTP errors rather than as a delayed "ERROR" trigger state.
   */
  @CreateAiHelperTriggerSpec()
  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  async createAiHelperTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateAiHelperTriggerRequestApiDto
  ): Promise<{ triggerId: string }> {
    if (!this.aiInsightsConfig.isInsightsEnabled()) {
      throw new ServiceUnavailableException(
        'AI helper is not configured on this deployment. Add AI_BASE_URL, AI_API_KEY and AI_MODEL environment variables to enable it.'
      );
    }

    if (context.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.DATA_MART,
        dataMartId,
        Action.EDIT,
        context.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    const triggerId = await (this.triggerService as AiHelperTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId,
      dto.scope,
      dto.useSample,
      dto.fieldName?.trim() ? dto.fieldName.trim() : null
    );

    return { triggerId };
  }

  @GetAiHelperTriggerStatusSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Get('/:triggerId/status')
  public override async getTriggerStatus(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<{ status: TriggerStatus }> {
    return super.getTriggerStatus(triggerId, context);
  }

  @GetAiHelperTriggerResponseSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Get('/:triggerId')
  public override async getTriggerResponse(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<AiHelperUiResponse> {
    return super.getTriggerResponse(triggerId, context);
  }

  @CancelAiHelperTriggerSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Delete('/:triggerId')
  public override async abortTriggerRun(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<void> {
    return super.abortTriggerRun(triggerId, context);
  }
}
