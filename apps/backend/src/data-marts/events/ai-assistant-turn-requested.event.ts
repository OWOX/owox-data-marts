import { BaseEvent } from '@owox/internal-helpers';

export interface AiAssistantTurnRequestedEventPayload {
  projectId: string;
  dataMartId: string;
  userId: string;
  sessionId: string;
  templateId: string | null;
  turnId: string;
  userMessageId: string;
  message: string;
}

export class AiAssistantTurnRequestedEvent extends BaseEvent<AiAssistantTurnRequestedEventPayload> {
  get name() {
    return 'ai_assistant.turn_requested' as const;
  }

  constructor(payload: AiAssistantTurnRequestedEventPayload) {
    super(payload);
  }
}
