import { createClsKey } from '../../common/logger/cls-context.service';
import { AI_ASSISTANT_LOG_CONTEXT as AI_ASSISTANT_LOG_CONTEXT_VALUE } from '../../common/logger/context-keys';

export interface AiAssistantLogContext {
  projectId?: string;
  dataMartId?: string;
  templateId?: string | null;
  userId?: string;
  sessionId?: string;
  userMessageId?: string;
  assistantMessageId?: string | null;
  runId?: string | null;
}

export const AI_ASSISTANT_LOG_CONTEXT = createClsKey<AiAssistantLogContext>(
  AI_ASSISTANT_LOG_CONTEXT_VALUE
);
