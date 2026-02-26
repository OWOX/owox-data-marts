import { Injectable } from '@nestjs/common';
import { GetAiAssistantSessionCommand } from '../dto/domain/get-ai-assistant-session.command';
import { AiAssistantSessionDto } from '../dto/domain/ai-assistant-session.dto';
import { AiAssistantMessageApplyStatus } from '../dto/domain/ai-assistant-message.dto';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';

@Injectable()
export class GetAiAssistantSessionService {
  constructor(
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly mapper: AiAssistantMapper
  ) {}

  async run(command: GetAiAssistantSessionCommand): Promise<AiAssistantSessionDto> {
    const session = await this.aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId(
      command.sessionId,
      command.dataMartId,
      command.projectId,
      command.userId
    );

    const [messages, applySnapshots] = await Promise.all([
      this.aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId(
        command.sessionId,
        command.dataMartId,
        command.projectId,
        command.userId
      ),
      this.aiAssistantSessionService.listApplyActionSnapshotsBySession({
        sessionId: command.sessionId,
        createdById: command.userId,
      }),
    ]);

    const appliedByAssistantMessageId = new Map<
      string,
      {
        appliedAt: Date;
        requestId: string;
      }
    >();

    for (const snapshot of applySnapshots) {
      if (snapshot.lifecycleStatus !== 'applied' || !snapshot.assistantMessageId) {
        continue;
      }

      const previous = appliedByAssistantMessageId.get(snapshot.assistantMessageId);
      if (!previous || snapshot.modifiedAt.getTime() >= previous.appliedAt.getTime()) {
        appliedByAssistantMessageId.set(snapshot.assistantMessageId, {
          appliedAt: snapshot.modifiedAt,
          requestId: snapshot.requestId,
        });
      }
    }

    return this.mapper.toDomainSessionDto(
      session,
      messages.map(message => {
        const applied = appliedByAssistantMessageId.get(message.id);
        if (applied) {
          return this.mapper.toDomainMessageDto(message, {
            applyStatus: AiAssistantMessageApplyStatus.APPLIED,
            appliedAt: applied.appliedAt,
            appliedRequestId: applied.requestId,
          });
        }

        const hasPendingActions =
          message.role === AiAssistantMessageRole.ASSISTANT &&
          Array.isArray(message.proposedActions) &&
          message.proposedActions.length > 0;

        return this.mapper.toDomainMessageDto(message, {
          applyStatus: hasPendingActions
            ? AiAssistantMessageApplyStatus.PENDING
            : AiAssistantMessageApplyStatus.NONE,
          appliedAt: null,
          appliedRequestId: null,
        });
      })
    );
  }
}
