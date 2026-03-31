import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OwoxProducer } from '@owox/internal-helpers';

import { CreateAiAssistantMessageCommand } from '../dto/domain/create-ai-assistant-message.command';
import {
  AiAssistantExecutionMode,
  AiAssistantMessageResultDto,
} from '../dto/domain/ai-assistant-message-result.dto';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { AiAssistantTurnRequestedEvent } from '../events/ai-assistant-turn-requested.event';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantRunTriggerService } from '../services/ai-assistant-run-trigger.service';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { InsightTemplateService } from '../services/insight-template.service';
import { generateAiAssistantSessionTitleFromMessage } from './utils/generate-ai-assistant-session-title-from-message.util';

@Injectable()
export class CreateAiAssistantMessageService {
  private readonly logger = new Logger(CreateAiAssistantMessageService.name);

  constructor(
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly aiAssistantRunTriggerService: AiAssistantRunTriggerService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly mapper: AiAssistantMapper
  ) {}

  async run(command: CreateAiAssistantMessageCommand): Promise<AiAssistantMessageResultDto> {
    let session = await this.aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId(
      command.sessionId,
      command.dataMartId,
      command.projectId,
      command.userId
    );

    const userMessage = await this.aiAssistantSessionService.addMessage({
      sessionId: session.id,
      role: AiAssistantMessageRole.USER,
      content: command.text,
    });

    const generatedTitle = generateAiAssistantSessionTitleFromMessage(command.text);
    if (!session.title?.trim()) {
      if (generatedTitle) {
        session =
          await this.aiAssistantSessionService.updateSessionTitleByIdAndDataMartIdAndProjectId(
            session.id,
            command.dataMartId,
            command.projectId,
            command.userId,
            generatedTitle
          );
      }
    }
    await this.insightTemplateService.updateTitleOnlyIfHasDefaultTitle(
      session.templateId,
      command.dataMartId,
      command.projectId,
      generatedTitle
    );

    const triggerId = await this.aiAssistantRunTriggerService.createTrigger({
      userId: command.userId,
      projectId: command.projectId,
      dataMartId: command.dataMartId,
      sessionId: session.id,
      userMessageId: userMessage.id,
    });

    await this.producer.produceEvent(
      new AiAssistantTurnRequestedEvent({
        projectId: command.projectId,
        dataMartId: command.dataMartId,
        userId: command.userId,
        sessionId: session.id,
        templateId: session.templateId ?? null,
        turnId: userMessage.id,
        userMessageId: userMessage.id,
        message: userMessage.content,
      })
    );

    this.logger.log('AiAssistantRun', {
      projectId: command.projectId,
      dataMartId: command.dataMartId,
      userId: command.userId,
      sessionId: session.id,
      templateId: session.templateId,
      userMessageId: userMessage.id,
      triggerId,
    });

    return new AiAssistantMessageResultDto(
      AiAssistantExecutionMode.HEAVY,
      triggerId,
      null,
      this.mapper.toDomainMessageDto(userMessage, userMessage.proposedActions ?? null),
      null
    );
  }
}
