import { Injectable, Logger } from '@nestjs/common';

import { CreateAiAssistantMessageCommand } from '../dto/domain/create-ai-assistant-message.command';
import {
  AiAssistantExecutionMode,
  AiAssistantMessageResultDto,
} from '../dto/domain/ai-assistant-message-result.dto';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantRunTriggerService } from '../services/ai-assistant-run-trigger.service';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { generateAiAssistantSessionTitleFromMessage } from './utils/generate-ai-assistant-session-title-from-message.util';

@Injectable()
export class CreateAiAssistantMessageService {
  private readonly logger = new Logger(CreateAiAssistantMessageService.name);

  constructor(
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly aiAssistantRunTriggerService: AiAssistantRunTriggerService,
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
      meta: {
        correlationId: command.correlationId,
        turnContext: command.turnContext,
      },
    });

    if (!session.title?.trim()) {
      const generatedTitle = generateAiAssistantSessionTitleFromMessage(command.text);
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

    const runId = await this.aiAssistantRunTriggerService.createTrigger({
      userId: command.userId,
      projectId: command.projectId,
      dataMartId: command.dataMartId,
      sessionId: session.id,
      userMessageId: userMessage.id,
    });

    this.logger.log('ai_session_run', {
      correlationId: command.correlationId ?? null,
      sessionId: session.id,
      templateId: session.templateId ?? null,
      userMessageId: userMessage.id,
      runId,
    });

    return new AiAssistantMessageResultDto(
      AiAssistantExecutionMode.HEAVY,
      runId,
      null,
      this.mapper.toDomainMessageDto(userMessage),
      null
    );
  }
}
