import { BaseEvent } from '@owox/internal-helpers';
import type { AgentTelemetry } from '../../common/ai-insights/agent/types';
import type {
  AiAssistantResponse,
  AssistantProposedAction,
} from '../ai-insights/agent-flow/ai-assistant-types';
import { ModelUsageByModel, ModelUsageTotals } from '../ai-insights/utils/compute-model-usage';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';

export interface AiAssistantTurnProcessedResolvedContext {
  targetSourceId?: string;
  targetSourceKey?: string;
  targetKind?: 'TABLE' | 'VALUE';
}

export interface AiAssistantTurnProcessedEventToolCall {
  turn: number;
  name: string;
  args: unknown;
  success: boolean;
  toolResult?: unknown;
  errorMessage?: string;
}

export interface AiAssistantTurnProcessedEventTelemetry {
  llmCalls: AgentTelemetry['llmCalls'];
  toolCalls: AiAssistantTurnProcessedEventToolCall[];
  prefetch?: AgentTelemetry['prefetch'];
}

export interface AiAssistantTurnProcessedEventMeta {
  reasonDescription?: string;
  telemetry: AiAssistantTurnProcessedEventTelemetry;
  totalUsage: ModelUsageTotals;
  totalUsageByModel: ModelUsageByModel[];
  llmCalls: number;
  toolCalls: number;
  failedToolCalls: number;
  lastFinishReason?: string;
}

export interface AiAssistantTurnProcessedEventPayload {
  projectId: string;
  dataMartId: string;
  userId: string;
  sessionId: string;
  templateId: string | null;
  runId: string;
  turnId: string;
  userMessageId: string;
  assistantMessageId: string | null;
  assistantStatus: AiAssistantResponse['status'];
  status: DataMartRunStatus.SUCCESS | DataMartRunStatus.FAILED;
  decision: AiAssistantResponse['decision'];
  reasonDescription?: string;
  error?: string;
  userMessage: string;
  assistantMessage: string;
  hasSqlCandidate: boolean;
  sql?: string;
  proposedActionTypes: AssistantProposedAction['type'][];
  proposedActionCount: number;
  resolvedContext?: AiAssistantTurnProcessedResolvedContext;
  meta: AiAssistantTurnProcessedEventMeta;
}

export class AiAssistantTurnProcessedEvent extends BaseEvent<AiAssistantTurnProcessedEventPayload> {
  get name() {
    return 'ai_assistant.turn_processed' as const;
  }

  constructor(payload: AiAssistantTurnProcessedEventPayload) {
    super(payload);
  }
}
