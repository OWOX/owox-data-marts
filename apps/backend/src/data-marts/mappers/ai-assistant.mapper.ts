import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { ApplyAiAssistantSessionCommand } from '../dto/domain/apply-ai-assistant-session.command';
import { AiAssistantApplyResultDto } from '../dto/domain/ai-assistant-apply-result.dto';
import { CreateAiAssistantMessageCommand } from '../dto/domain/create-ai-assistant-message.command';
import {
  AiAssistantExecutionMode,
  AiAssistantMessageResultDto,
} from '../dto/domain/ai-assistant-message-result.dto';
import {
  AiAssistantMessageApplyStatus,
  AiAssistantMessageDto,
} from '../dto/domain/ai-assistant-message.dto';
import { AiAssistantSessionDto } from '../dto/domain/ai-assistant-session.dto';
import { AiAssistantSessionListItemDto } from '../dto/domain/ai-assistant-session-list-item.dto';
import { CreateAiAssistantSessionCommand } from '../dto/domain/create-ai-assistant-session.command';
import { DeleteAiAssistantSessionCommand } from '../dto/domain/delete-ai-assistant-session.command';
import { GetAiAssistantSessionCommand } from '../dto/domain/get-ai-assistant-session.command';
import { ListAiAssistantSessionsCommand } from '../dto/domain/list-ai-assistant-sessions.command';
import { UpdateAiAssistantSessionTitleCommand } from '../dto/domain/update-ai-assistant-session-title.command';
import { AiAssistantMessageResponseApiDto } from '../dto/presentation/ai-assistant-message-response-api.dto';
import { AiAssistantSessionListItemResponseApiDto } from '../dto/presentation/ai-assistant-session-list-item-response-api.dto';
import { AiAssistantSessionResponseApiDto } from '../dto/presentation/ai-assistant-session-response-api.dto';
import { ApplyAiAssistantSessionRequestApiDto } from '../dto/presentation/apply-ai-assistant-session-request-api.dto';
import { ApplyAiAssistantSessionResponseApiDto } from '../dto/presentation/apply-ai-assistant-session-response-api.dto';
import {
  AiAssistantExecutionModeApi,
  CreateAiAssistantMessageResponseApiDto,
} from '../dto/presentation/create-ai-assistant-message-response-api.dto';
import {
  CreateAiAssistantMessageRequestApiDto,
  CreateAiAssistantMessageTurnContextApiDto,
} from '../dto/presentation/create-ai-assistant-message-request-api.dto';
import { CreateAiAssistantSessionRequestApiDto } from '../dto/presentation/create-ai-assistant-session-request-api.dto';
import { CreateAiAssistantSessionResponseApiDto } from '../dto/presentation/create-ai-assistant-session-response-api.dto';
import { UpdateAiAssistantSessionTitleRequestApiDto } from '../dto/presentation/update-ai-assistant-session-title-request-api.dto';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantMessage } from '../entities/ai-assistant-message.entity';
import { AiAssistantSession } from '../entities/ai-assistant-session.entity';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';

interface MessageApplyState {
  applyStatus: AiAssistantMessageApplyStatus;
  appliedAt: Date | null;
  appliedRequestId: string | null;
}

@Injectable()
export class AiAssistantMapper {
  toApplySessionCommand(
    sessionId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: ApplyAiAssistantSessionRequestApiDto
  ): ApplyAiAssistantSessionCommand {
    return new ApplyAiAssistantSessionCommand(
      sessionId,
      dataMartId,
      context.projectId,
      context.userId,
      dto.requestId,
      dto.assistantMessageId,
      dto.sql,
      dto.artifactTitle
    );
  }

  toCreateSessionCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateAiAssistantSessionRequestApiDto
  ): CreateAiAssistantSessionCommand {
    return new CreateAiAssistantSessionCommand(
      dataMartId,
      context.projectId,
      context.userId,
      dto.templateId ?? null
    );
  }

  toGetSessionCommand(
    sessionId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): GetAiAssistantSessionCommand {
    return new GetAiAssistantSessionCommand(
      sessionId,
      dataMartId,
      context.projectId,
      context.userId
    );
  }

  toListSessionsCommand(params: {
    dataMartId: string;
    context: AuthorizationContext;
    scope: AiAssistantScope;
    templateId?: string | null;
    limit?: number;
    offset?: number;
  }): ListAiAssistantSessionsCommand {
    return new ListAiAssistantSessionsCommand(
      params.dataMartId,
      params.context.projectId,
      params.context.userId,
      params.scope,
      params.templateId,
      params.limit,
      params.offset
    );
  }

  toUpdateSessionTitleCommand(
    sessionId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateAiAssistantSessionTitleRequestApiDto
  ): UpdateAiAssistantSessionTitleCommand {
    return new UpdateAiAssistantSessionTitleCommand(
      sessionId,
      dataMartId,
      context.projectId,
      context.userId,
      dto.title
    );
  }

  toDeleteSessionCommand(
    sessionId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteAiAssistantSessionCommand {
    return new DeleteAiAssistantSessionCommand(
      sessionId,
      dataMartId,
      context.projectId,
      context.userId
    );
  }

  toCreateMessageCommand(
    sessionId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateAiAssistantMessageRequestApiDto
  ): CreateAiAssistantMessageCommand {
    return new CreateAiAssistantMessageCommand(
      sessionId,
      dataMartId,
      context.projectId,
      context.userId,
      dto.text,
      dto.correlationId ?? null,
      dto.turnContext ? this.toCreateMessageTurnContext(dto.turnContext) : null
    );
  }

  toCreateSessionResponse(sessionId: string): CreateAiAssistantSessionResponseApiDto {
    return { sessionId };
  }

  toDomainMessageDto(
    entity: AiAssistantMessage,
    proposedActions: AssistantProposedAction[] | null,
    applyState?: MessageApplyState
  ): AiAssistantMessageDto {
    const resolvedApplyState =
      applyState ?? this.resolveDefaultMessageApplyState(entity, proposedActions);

    return new AiAssistantMessageDto(
      entity.id,
      entity.sessionId,
      entity.role,
      entity.content,
      proposedActions,
      entity.sqlCandidate ?? null,
      entity.meta ?? null,
      entity.createdAt,
      resolvedApplyState.applyStatus,
      resolvedApplyState.appliedAt,
      resolvedApplyState.appliedRequestId
    );
  }

  toDomainSessionDto(
    session: AiAssistantSession,
    messages: Array<AiAssistantMessage | AiAssistantMessageDto>
  ): AiAssistantSessionDto {
    const messageDtos = messages.map(message =>
      message instanceof AiAssistantMessageDto
        ? message
        : this.toDomainMessageDto(message, message.proposedActions ?? null)
    );

    return new AiAssistantSessionDto(
      session.id,
      session.dataMartId,
      session.scope,
      session.title ?? null,
      session.templateId ?? null,
      session.createdById,
      session.createdAt,
      session.updatedAt,
      messageDtos
    );
  }

  toDomainSessionListItemDto(session: AiAssistantSession): AiAssistantSessionListItemDto {
    return new AiAssistantSessionListItemDto(
      session.id,
      session.dataMartId,
      session.scope,
      session.title ?? null,
      session.templateId ?? null,
      session.createdAt,
      session.updatedAt
    );
  }

  toDomainSessionListItemDtoList(sessions: AiAssistantSession[]): AiAssistantSessionListItemDto[] {
    return sessions.map(session => this.toDomainSessionListItemDto(session));
  }

  toMessageResponse(dto: AiAssistantMessageDto): AiAssistantMessageResponseApiDto {
    return {
      id: dto.id,
      sessionId: dto.sessionId,
      role: dto.role,
      content: dto.content,
      proposedActions: dto.proposedActions,
      sqlCandidate: dto.sqlCandidate,
      applyStatus: dto.applyStatus,
      appliedAt: dto.appliedAt,
      appliedRequestId: dto.appliedRequestId,
      createdAt: dto.createdAt,
    };
  }

  toSessionResponse(dto: AiAssistantSessionDto): AiAssistantSessionResponseApiDto {
    return {
      id: dto.id,
      dataMartId: dto.dataMartId,
      scope: dto.scope,
      title: dto.title,
      templateId: dto.templateId,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      messages: dto.messages.map(message => this.toMessageResponse(message)),
    };
  }

  toSessionListItemResponse(
    dto: AiAssistantSessionListItemDto
  ): AiAssistantSessionListItemResponseApiDto {
    return {
      id: dto.id,
      dataMartId: dto.dataMartId,
      scope: dto.scope,
      title: dto.title,
      templateId: dto.templateId,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }

  toSessionListItemResponseList(
    dtos: AiAssistantSessionListItemDto[]
  ): AiAssistantSessionListItemResponseApiDto[] {
    return dtos.map(dto => this.toSessionListItemResponse(dto));
  }

  toCreateMessageResponse(
    dto: AiAssistantMessageResultDto
  ): CreateAiAssistantMessageResponseApiDto {
    return {
      mode:
        dto.mode === AiAssistantExecutionMode.HEAVY
          ? AiAssistantExecutionModeApi.HEAVY
          : AiAssistantExecutionModeApi.LIGHTWEIGHT,
      triggerId: dto.triggerId,
      response: dto.response,
      userMessage: this.toMessageResponse(dto.userMessage),
      assistantMessage: dto.assistantMessage ? this.toMessageResponse(dto.assistantMessage) : null,
    };
  }

  toApplySessionResponse(dto: AiAssistantApplyResultDto): ApplyAiAssistantSessionResponseApiDto {
    return {
      requestId: dto.requestId,
      artifactId: dto.artifactId,
      artifactTitle: dto.artifactTitle,
      templateUpdated: dto.templateUpdated,
      templateId: dto.templateId,
      sourceKey: dto.sourceKey,
      status: dto.status,
      reason: dto.reason,
    };
  }

  private toCreateMessageTurnContext(dto: CreateAiAssistantMessageTurnContextApiDto): {
    sourceKeyHint?: string;
    artifactIdHint?: string;
    preferredSnippetType?: 'table' | 'single_value';
  } {
    return {
      sourceKeyHint: dto.sourceKeyHint,
      artifactIdHint: dto.artifactIdHint,
      preferredSnippetType: dto.preferredSnippetType,
    };
  }

  private resolveDefaultMessageApplyState(
    entity: AiAssistantMessage,
    proposedActions: AssistantProposedAction[] | null
  ): MessageApplyState {
    const hasPendingActions =
      entity.role === AiAssistantMessageRole.ASSISTANT &&
      Array.isArray(proposedActions) &&
      proposedActions.length > 0;

    return {
      applyStatus: hasPendingActions
        ? AiAssistantMessageApplyStatus.PENDING
        : AiAssistantMessageApplyStatus.NONE,
      appliedAt: null,
      appliedRequestId: null,
    };
  }
}
