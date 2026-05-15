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
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataMartAiHelperGeneratedEvent } from '../events/data-mart-ai-helper-generated.event';

@Injectable()
export class GenerateDataMartMetadataService {
  private readonly logger = new Logger(GenerateDataMartMetadataService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly aiInsightsConfig: AiInsightsConfigService,
    private readonly eventDispatcher: OwoxEventDispatcher,
    @Inject(AI_INSIGHTS_FACADE)
    private readonly aiInsightsFacade: AiInsightsFacade
  ) {}

  async run(command: GenerateDataMartMetadataCommand): Promise<GenerateDataMartMetadataResponse> {
    if (!this.aiInsightsConfig.isInsightsEnabled()) {
      throw new ServiceUnavailableException(
        'AI helper is not configured on this deployment. Add AI_BASE_URL, AI_API_KEY and AI_MODEL environment variables to enable it.'
      );
    }

    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId && !command.skipAccessCheck) {
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

    const result = await this.aiInsightsFacade.generateDataMartMetadata({
      projectId: command.projectId,
      dataMartId: command.id,
      scope: command.scope,
      useSample: command.useSample,
      fieldName: command.fieldName,
    });

    // Fire-and-forget analytics — transport failures must not break the user response.
    try {
      await this.eventDispatcher.publishExternal(
        new DataMartAiHelperGeneratedEvent({
          projectId: command.projectId,
          dataMartId: command.id,
          userId: command.userId,
          scope: command.scope,
        })
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish DataMartAiHelperGeneratedEvent (scope=${command.scope})`,
        error
      );
    }

    return result;
  }
}
