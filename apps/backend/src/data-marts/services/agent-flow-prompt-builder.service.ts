import { Injectable } from '@nestjs/common';
import { AiMessage, AiRole } from '../../common/ai-insights/agent/ai-core';
import {
  buildAgentFlowContextSystemPrompt,
  buildAgentFlowSystemPrompt,
  buildAgentFlowUserPrompt,
} from '../ai-insights/agent-flow/prompts/agent-flow.prompt';
import { AgentFlowPromptContext, AgentFlowRequest } from '../ai-insights/agent-flow/types';

@Injectable()
export class AgentFlowPromptBuilder {
  buildInitialMessages(params: {
    request: AgentFlowRequest;
    promptContext: AgentFlowPromptContext;
  }): AiMessage[] {
    const { promptContext } = params;
    const contextSystemPrompt = buildAgentFlowContextSystemPrompt({
      stateSnapshot: promptContext.stateSnapshot,
    });

    const userPrompt = buildAgentFlowUserPrompt({
      recentTurns: promptContext.recentTurns,
      conversationSnapshot: promptContext.conversationSnapshot,
    });

    const messages: AiMessage[] = [{ role: AiRole.SYSTEM, content: buildAgentFlowSystemPrompt() }];

    if (contextSystemPrompt) {
      messages.push({ role: AiRole.SYSTEM, content: contextSystemPrompt });
    }

    messages.push({ role: AiRole.USER, content: userPrompt });

    return messages;
  }
}
