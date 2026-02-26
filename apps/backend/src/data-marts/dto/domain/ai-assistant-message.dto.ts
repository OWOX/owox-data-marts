import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import type { AssistantProposedAction } from '../../ai-insights/agent-flow/ai-assistant-types';

export enum AiAssistantMessageApplyStatus {
  NONE = 'none',
  PENDING = 'pending',
  APPLIED = 'applied',
}

export class AiAssistantMessageDto {
  constructor(
    public readonly id: string,
    public readonly sessionId: string,
    public readonly role: AiAssistantMessageRole,
    public readonly content: string,
    public readonly proposedActions: AssistantProposedAction[] | null,
    public readonly sqlCandidate: string | null,
    public readonly meta: Record<string, unknown> | null,
    public readonly createdAt: Date,
    public readonly applyStatus: AiAssistantMessageApplyStatus,
    public readonly appliedAt: Date | null,
    public readonly appliedRequestId: string | null
  ) {}
}
