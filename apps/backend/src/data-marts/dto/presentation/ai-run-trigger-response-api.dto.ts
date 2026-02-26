import { AssistantOrchestratorResponse } from '../../ai-insights/agent-flow/ai-assistant-types';

export type AiRunTriggerResponseApiDto =
  | {
      runId: string;
      response: AssistantOrchestratorResponse;
      assistantMessageId: string | null;
    }
  | { error: string };
