import { AiAssistantResponse } from '../../ai-insights/agent-flow/ai-assistant-types';

export type AiRunTriggerResponseApiDto =
  | {
      runId: string;
      response: AiAssistantResponse;
      assistantMessageId: string | null;
    }
  | { error: string };
