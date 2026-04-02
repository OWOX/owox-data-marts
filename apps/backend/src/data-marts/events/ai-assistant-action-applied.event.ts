import { BaseEvent } from '@owox/internal-helpers';
import type { ApplyAiAssistantActionType } from '../dto/domain/ai-assistant-apply.types';

export type AiAssistantActionAppliedResultStatus = 'successful' | 'failed';

export interface AiAssistantActionAppliedEventPayload {
  projectId: string;
  dataMartId: string;
  userId: string;
  sessionId: string;
  assistantMessageId: string;
  requestId: string;
  actionType: ApplyAiAssistantActionType | null;
  resultStatus: AiAssistantActionAppliedResultStatus;
  artifactId: string | null;
  artifactTitle: string | null;
  templateId: string | null;
  template?: string;
  sourceKey: string | null;
  templateUpdated: boolean;
  error?: string;
}

export class AiAssistantActionAppliedEvent extends BaseEvent<AiAssistantActionAppliedEventPayload> {
  get name() {
    return 'ai_assistant.action_applied' as const;
  }

  constructor(payload: AiAssistantActionAppliedEventPayload) {
    super(payload);
  }
}
