import { Injectable } from '@nestjs/common';
import { AiMessage, AiRole } from '../../common/ai-insights/agent/ai-core';
import {
  buildAgentFlowContextSystemPrompt,
  buildAgentFlowSystemPrompt,
  buildAgentFlowUserPrompt,
} from '../ai-insights/agent-flow/prompts/agent-flow.prompt';
import { AgentFlowPromptContext, AgentFlowRequest } from '../ai-insights/agent-flow/types';
import { getLastUserMessage } from '../ai-insights/agent-flow/ai-assistant-orchestrator.utils';
import { ConversationTurn } from '../ai-insights/agent/types';
import { buildAgentInitialMessages } from '../ai-insights/utils/build-agent-initial-messages';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';

type ConversationRole = AiRole.SYSTEM | AiRole.USER | AiRole.ASSISTANT;

@Injectable()
export class AgentFlowPromptBuilder {
  buildInitialMessages(params: {
    request: AgentFlowRequest;
    promptContext: AgentFlowPromptContext;
  }): AiMessage[] {
    const { promptContext } = params;
    const latestUserMessage = getLastUserMessage(promptContext.conversationContext.turns);
    const contextSystemPrompt = buildAgentFlowContextSystemPrompt({
      stateSnapshot: promptContext.stateSnapshot,
      conversationSnapshot: promptContext.conversationContext.conversationSnapshot,
    });

    const userPrompt = buildAgentFlowUserPrompt({
      latestUserMessage,
    });

    return buildAgentInitialMessages({
      systemPrompt: buildAgentFlowSystemPrompt(),
      contextSystemPrompt,
      conversationTurns: this.toConversationTurns(promptContext),
      userPrompt,
    });
  }

  private toConversationTurns(promptContext: AgentFlowPromptContext): ConversationTurn[] {
    return promptContext.conversationContext.turns.map(turn => ({
      role: this.toAiRole(turn.role),
      content: turn.content,
    }));
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
