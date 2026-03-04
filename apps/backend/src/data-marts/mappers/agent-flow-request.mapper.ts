import { Injectable } from '@nestjs/common';
import {
  AssistantChatMessage,
  AssistantOrchestratorRequest,
} from '../ai-insights/agent-flow/ai-assistant-types';
import { AgentFlowRequest } from '../ai-insights/agent-flow/types';

@Injectable()
export class AgentFlowRequestMapper {
  toAssistantOrchestratorRequest(params: {
    request: AgentFlowRequest;
    history?: AssistantChatMessage[];
    currentSourceSql?: string;
  }): AssistantOrchestratorRequest {
    const { request, history, currentSourceSql } = params;

    return {
      projectId: request.projectId,
      dataMartId: request.dataMartId,
      history: history ?? request.history,
      sessionContext: {
        sessionId: request.sessionContext.sessionId,
        scope: request.sessionContext.scope,
        templateId: request.sessionContext.templateId,
        ...(typeof currentSourceSql === 'string' ? { currentSourceSql } : {}),
      },
      ...(request.options ? { options: request.options } : {}),
    };
  }
}
