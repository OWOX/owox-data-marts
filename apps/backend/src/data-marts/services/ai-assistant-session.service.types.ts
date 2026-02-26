import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import type { AiAssistantApplyLifecycleStatus } from '../dto/domain/ai-assistant-apply.types';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';

export interface CreateAiAssistantSessionInput {
  dataMartId: string;
  createdById: string;
  scope: AiAssistantScope;
  title?: string | null;
  templateId: string;
}

export interface AddAiAssistantMessageInput {
  sessionId: string;
  role: AiAssistantMessageRole;
  content: string;
  proposedActions?: AssistantProposedAction[] | null;
  sqlCandidate?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface ListAiAssistantSessionsParams {
  dataMartId: string;
  projectId: string;
  createdById: string;
  scope: AiAssistantScope;
  templateId?: string | null;
  limit?: number;
  offset?: number;
}

export interface AiAssistantSessionApplyActionSnapshot {
  id: string;
  requestId: string;
  assistantMessageId: string | null;
  lifecycleStatus: AiAssistantApplyLifecycleStatus | null;
  modifiedAt: Date;
}
