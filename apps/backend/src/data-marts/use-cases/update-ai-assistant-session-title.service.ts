import { Injectable } from '@nestjs/common';
import { UpdateAiAssistantSessionTitleCommand } from '../dto/domain/update-ai-assistant-session-title.command';
import { AiAssistantSessionListItemDto } from '../dto/domain/ai-assistant-session-list-item.dto';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';

@Injectable()
export class UpdateAiAssistantSessionTitleService {
  constructor(
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly mapper: AiAssistantMapper
  ) {}

  async run(command: UpdateAiAssistantSessionTitleCommand): Promise<AiAssistantSessionListItemDto> {
    const updated =
      await this.aiAssistantSessionService.updateSessionTitleByIdAndDataMartIdAndProjectId(
        command.sessionId,
        command.dataMartId,
        command.projectId,
        command.userId,
        command.title
      );

    return this.mapper.toDomainSessionListItemDto(updated);
  }
}
