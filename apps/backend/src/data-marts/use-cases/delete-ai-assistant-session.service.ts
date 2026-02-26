import { Injectable } from '@nestjs/common';
import { DeleteAiAssistantSessionCommand } from '../dto/domain/delete-ai-assistant-session.command';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';

@Injectable()
export class DeleteAiAssistantSessionService {
  constructor(private readonly aiAssistantSessionService: AiAssistantSessionService) {}

  async run(command: DeleteAiAssistantSessionCommand): Promise<void> {
    await this.aiAssistantSessionService.deleteSessionByIdAndDataMartIdAndProjectId(
      command.sessionId,
      command.dataMartId,
      command.projectId,
      command.userId
    );
  }
}
