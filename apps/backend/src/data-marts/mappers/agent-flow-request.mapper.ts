import { Injectable } from '@nestjs/common';
import { AiRole } from '../../common/ai-insights/agent/ai-core';
import {
  AssistantChatMessage,
  AssistantConversationContext,
  AssistantSqlOrchestratorRequest,
} from '../ai-insights/agent-flow/ai-assistant-types';
import { AgentFlowRequest } from '../ai-insights/agent-flow/types';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';

type ConversationRole = AiRole.SYSTEM | AiRole.USER | AiRole.ASSISTANT;

@Injectable()
export class AgentFlowRequestMapper {
  toAssistantSqlOrchestratorRequest(params: {
    request: AgentFlowRequest;
    conversationContext: AssistantConversationContext;
  }): AssistantSqlOrchestratorRequest {
    const { request, conversationContext } = params;

    return {
      projectId: request.projectId,
      dataMartId: request.dataMartId,
      conversationContext,
      sessionContext: {
        sessionId: request.sessionContext.sessionId,
        scope: request.sessionContext.scope,
        templateId: request.sessionContext.templateId,
      },
      options: request.options,
    };
  }

  toAgentConversationContext(params: {
    request: AgentFlowRequest;
    mode: 'create' | 'refine';
    turns?: AssistantChatMessage[];
    currentSourceSql?: string | null;
  }): AssistantConversationContext {
    const { request, mode, turns, currentSourceSql } = params;
    const effectiveTurns = turns ?? request.conversationContext.turns;

    return {
      mode: mode === 'refine' ? 'refine_existing_sql' : 'create_new_source_sql',
      turns: effectiveTurns.map(turn => ({
        role: this.toAiRole(turn.role),
        content: turn.content,
      })),
      currentSourceSql: currentSourceSql ?? null,
      conversationSnapshot: request.conversationContext.conversationSnapshot,
    };
  }

  private toAiRole(role: AiAssistantMessageRole): ConversationRole {
    if (role === AiAssistantMessageRole.SYSTEM) {
      return AiRole.SYSTEM;
    }

    if (role === AiAssistantMessageRole.ASSISTANT) {
      return AiRole.ASSISTANT;
    }

    return AiRole.USER;
  }
}
