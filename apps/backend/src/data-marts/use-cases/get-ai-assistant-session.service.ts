import { Injectable } from '@nestjs/common';
import { GetAiAssistantSessionCommand } from '../dto/domain/get-ai-assistant-session.command';
import { AiAssistantSessionDto } from '../dto/domain/ai-assistant-session.dto';
import { AiAssistantMessageApplyStatus } from '../dto/domain/ai-assistant-message.dto';
import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';

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

    const [messages, applySnapshots, latestMessageWithProposedActions] = await Promise.all([
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
      this.aiAssistantSessionService.getLatestAssistantMessageWithProposedActionsBySession(
        command.sessionId
      ),
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
        const visibleProposedActions = this.resolveVisibleProposedActions(
          message.id,
          message.proposedActions,
          latestMessageWithProposedActions?.id
        );
        const applied = appliedByAssistantMessageId.get(message.id);
        if (applied) {
          return this.mapper.toDomainMessageDto(message, visibleProposedActions, {
            applyStatus: AiAssistantMessageApplyStatus.APPLIED,
            appliedAt: applied.appliedAt,
            appliedRequestId: applied.requestId,
          });
        }

        const hasPendingActions =
          message.role === AiAssistantMessageRole.ASSISTANT &&
          Array.isArray(visibleProposedActions) &&
          visibleProposedActions.length > 0;

        return this.mapper.toDomainMessageDto(message, visibleProposedActions, {
          applyStatus: hasPendingActions
            ? AiAssistantMessageApplyStatus.PENDING
            : AiAssistantMessageApplyStatus.NONE,
          appliedAt: null,
          appliedRequestId: null,
        });
      })
    );
  }

  private resolveVisibleProposedActions(
    messageId: string,
    proposedActions: AssistantProposedAction[] | null | undefined,
    latestAssistantMessageId: string | undefined
  ): AssistantProposedAction[] | null {
    if (!Array.isArray(proposedActions) || proposedActions.length === 0) {
      return null;
    }

    if (!latestAssistantMessageId || latestAssistantMessageId !== messageId) {
      return null;
    }

    return proposedActions;
  }
}
