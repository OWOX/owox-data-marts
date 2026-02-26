import { Injectable } from '@nestjs/common';
import { ListAiAssistantSessionsCommand } from '../dto/domain/list-ai-assistant-sessions.command';
import { AiAssistantSessionListItemDto } from '../dto/domain/ai-assistant-session-list-item.dto';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';

@Injectable()
export class ListAiAssistantSessionsService {
  constructor(
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly mapper: AiAssistantMapper
  ) {}

  async run(command: ListAiAssistantSessionsCommand): Promise<AiAssistantSessionListItemDto[]> {
    const sessions = await this.aiAssistantSessionService.listSessionsByDataMartIdAndProjectId({
      dataMartId: command.dataMartId,
      projectId: command.projectId,
      createdById: command.userId,
      scope: command.scope,
      templateId: command.templateId,
      limit: command.limit,
      offset: command.offset,
    });

    return this.mapper.toDomainSessionListItemDtoList(sessions);
  }
}
