import type {
  AiAssistantApplyLifecycleStatus,
  AiAssistantApplyStatus,
  ApplyAiAssistantActionType,
} from './ai-assistant-apply.types';
import type { ApplyAiAssistantActionPayload } from './apply-ai-assistant-session.command';

export interface AiAssistantApplyActionResponse {
  requestId: string;
  lifecycleStatus?: AiAssistantApplyLifecycleStatus;
  artifactId: string | null;
  artifactTitle: string | null;
  templateUpdated: boolean;
  templateId: string | null;
  sourceKey: string | null;
  assistantMessageId?: string | null;
  actionType?: ApplyAiAssistantActionType | null;
  targetArtifactId?: string | null;
  templateSourceId?: string | null;
  insertTag?: boolean | null;
  selectedAction?: ApplyAiAssistantActionPayload | null;
  status?: AiAssistantApplyStatus;
  reason?: string | null;
}
