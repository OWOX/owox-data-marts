import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AI_INSIGHTS_FACADE } from '../ai-insights/ai-insights-types';
import { AiInsightsFacade } from '../ai-insights/facades/ai-insights.facade';
import { GenerateDataMartMetadataResponse } from '../ai-insights/ai-insights-types';
import { GenerateDataMartMetadataCommand } from '../dto/domain/generate-data-mart-metadata.command';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { AiInsightsConfigService } from '../../common/ai-insights/services/ai-insights-config.service';

@Injectable()
export class GenerateDataMartMetadataService {
  private readonly logger = new Logger(GenerateDataMartMetadataService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly aiInsightsConfig: AiInsightsConfigService,
    @Inject(AI_INSIGHTS_FACADE)
    private readonly aiInsightsFacade: AiInsightsFacade
  ) {}

  /**
   * Generate AI metadata for a data mart.
   *
   * Access check pattern mirrors `SqlDryRunService`: when `command.userId` is empty,
   * the check is skipped — callers (today only `AiHelperTriggerHandlerService`) pass
   * an empty userId because access was already verified at the POST that created
   * the trigger, and the original request `roles` are no longer available in the
   * background scheduler context. Analytics events are emitted by the caller, not
   * here, to keep this use-case caller-agnostic.
   */
  async run(command: GenerateDataMartMetadataCommand): Promise<GenerateDataMartMetadataResponse> {
    if (!this.aiInsightsConfig.isInsightsEnabled()) {
      throw new ServiceUnavailableException(
        'AI helper is not configured on this deployment. Add AI_BASE_URL, AI_API_KEY and AI_MODEL environment variables to enable it.'
      );
    }

    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    this.logger.debug(
      `Generating metadata for data mart ${command.id} (scope=${command.scope}, useSample=${command.useSample})`
    );

    return this.aiInsightsFacade.generateDataMartMetadata({
      projectId: command.projectId,
      dataMartId: command.id,
      scope: command.scope,
      useSample: command.useSample,
      fieldName: command.fieldName,
    });
  }
}
