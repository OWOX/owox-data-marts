import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantMessage } from '../entities/ai-assistant-message.entity';
import { AiAssistantSession } from '../entities/ai-assistant-session.entity';
import { AiAssistantRunTrigger } from '../entities/ai-assistant-run-trigger.entity';
import { AiAssistantApplyAction } from '../entities/ai-assistant-apply-action.entity';
import type {
  AddAiAssistantMessageInput,
  AiAssistantSessionApplyActionSnapshot,
  CreateAiAssistantSessionInput,
  ListAiAssistantSessionsParams,
} from './ai-assistant-session.service.types';

@Injectable()
export class AiAssistantSessionService {
  constructor(
    @InjectRepository(AiAssistantSession)
    private readonly sessionRepository: Repository<AiAssistantSession>,
    @InjectRepository(AiAssistantMessage)
    private readonly messageRepository: Repository<AiAssistantMessage>,
    @InjectRepository(AiAssistantRunTrigger)
    private readonly runTriggerRepository: Repository<AiAssistantRunTrigger>,
    @InjectRepository(AiAssistantApplyAction)
    private readonly applyActionRepository: Repository<AiAssistantApplyAction>
  ) {}

  async createSession(input: CreateAiAssistantSessionInput): Promise<AiAssistantSession> {
    const session = this.sessionRepository.create({
      dataMartId: input.dataMartId,
      createdById: input.createdById,
      scope: input.scope,
      title: input.title ?? null,
      templateId: input.templateId,
    });

    return this.sessionRepository.save(session);
  }

  async getSessionByIdAndDataMartIdAndProjectId(
    sessionId: string,
    dataMartId: string,
    projectId: string,
    createdById: string
  ): Promise<AiAssistantSession> {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        createdById,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!session) {
      throw new NotFoundException(`AiAssistantSession with id ${sessionId} not found`);
    }

    return session;
  }

  async listSessionsByDataMartIdAndProjectId(
    params: ListAiAssistantSessionsParams
  ): Promise<AiAssistantSession[]> {
    const {
      dataMartId,
      projectId,
      createdById,
      scope,
      templateId,
      limit = 20,
      offset = 0,
    } = params;
    const where: FindOptionsWhere<AiAssistantSession> = {
      createdById,
      scope,
      dataMart: {
        id: dataMartId,
        projectId,
      },
    };

    if (templateId !== undefined) {
      where.templateId = templateId === null ? IsNull() : templateId;
    }

    return this.sessionRepository.find({
      where,
      relations: ['dataMart'],
      order: {
        updatedAt: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
      skip: offset,
    });
  }

  async updateSessionTitleByIdAndDataMartIdAndProjectId(
    sessionId: string,
    dataMartId: string,
    projectId: string,
    createdById: string,
    title: string
  ): Promise<AiAssistantSession> {
    const session = await this.getSessionByIdAndDataMartIdAndProjectId(
      sessionId,
      dataMartId,
      projectId,
      createdById
    );
    session.title = title.trim();
    return this.sessionRepository.save(session);
  }

  async deleteSessionByIdAndDataMartIdAndProjectId(
    sessionId: string,
    dataMartId: string,
    projectId: string,
    createdById: string
  ): Promise<void> {
    const session = await this.getSessionByIdAndDataMartIdAndProjectId(
      sessionId,
      dataMartId,
      projectId,
      createdById
    );

    await this.applyActionRepository.delete({
      sessionId,
      createdById,
    });
    await this.runTriggerRepository.delete({
      sessionId,
      userId: createdById,
      dataMartId,
      projectId,
    });
    await this.sessionRepository.remove(session);
  }

  async addMessage(input: AddAiAssistantMessageInput): Promise<AiAssistantMessage> {
    const message = this.messageRepository.create({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      proposedActions: input.proposedActions ?? null,
      sqlCandidate: input.sqlCandidate ?? null,
      meta: input.meta ?? null,
    });

    return this.messageRepository.save(message);
  }

  async listMessagesBySessionIdAndDataMartIdAndProjectId(
    sessionId: string,
    dataMartId: string,
    projectId: string,
    createdById: string
  ): Promise<AiAssistantMessage[]> {
    return this.messageRepository.find({
      where: {
        sessionId,
        session: {
          id: sessionId,
          createdById,
          dataMart: {
            id: dataMartId,
            projectId,
          },
        },
      },
      relations: ['session', 'session.dataMart'],
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  }

  async getAssistantMessageByIdAndSessionId(
    messageId: string,
    sessionId: string
  ): Promise<AiAssistantMessage> {
    const message = await this.messageRepository.findOne({
      where: {
        id: messageId,
        sessionId,
        role: AiAssistantMessageRole.ASSISTANT,
      },
    });

    if (!message) {
      throw new NotFoundException(
        `Assistant message with id ${messageId} is not found for session ${sessionId}`
      );
    }

    return message;
  }

  async getSuggestedArtifactTitleFromLatestAssistantActions(
    sessionId: string
  ): Promise<string | null> {
    const messagesRaw = await this.messageRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const messages = Array.isArray(messagesRaw) ? messagesRaw : [];

    for (const message of messages) {
      if (message.role !== AiAssistantMessageRole.ASSISTANT) {
        continue;
      }

      const proposedActions = this.extractProposedActionsFromMessage(message);
      if (!proposedActions.length) {
        continue;
      }

      for (const action of proposedActions) {
        if (
          action.type !== 'apply_sql_to_artifact' &&
          action.type !== 'apply_changes_to_source' &&
          action.type !== 'create_source_and_attach'
        ) {
          continue;
        }

        const normalized = this.normalizeContextHint(action.payload.suggestedArtifactTitle);
        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }

  async listApplyActionSnapshotsBySession(params: {
    sessionId: string;
    createdById: string;
  }): Promise<AiAssistantSessionApplyActionSnapshot[]> {
    const actions = await this.applyActionRepository.find({
      where: {
        sessionId: params.sessionId,
        createdById: params.createdById,
      },
      order: {
        modifiedAt: 'ASC',
        id: 'ASC',
      },
    });

    return actions.map(action => ({
      id: action.id,
      requestId: action.requestId,
      assistantMessageId:
        typeof action.response?.assistantMessageId === 'string'
          ? action.response.assistantMessageId
          : null,
      lifecycleStatus: action.response?.lifecycleStatus ?? null,
      modifiedAt: action.modifiedAt,
    }));
  }

  private extractProposedActionsFromMessage(
    message: AiAssistantMessage
  ): AssistantProposedAction[] {
    if (Array.isArray(message.proposedActions)) {
      return message.proposedActions as AssistantProposedAction[];
    }

    return [];
  }

  private normalizeContextHint(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
