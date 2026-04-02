import { Injectable } from '@nestjs/common';
import type { AgentTelemetry } from '../../common/ai-insights/agent/types';
import type {
  AiAssistantResponse,
  AssistantProposedAction,
} from '../ai-insights/agent-flow/ai-assistant-types';
import type { ModelUsageTotals } from '../ai-insights/utils/compute-model-usage';
import { getPromptTotalUsageByModels } from '../ai-insights/utils/compute-model-usage';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import {
  AiAssistantTurnProcessedEvent,
  type AiAssistantTurnProcessedEventTelemetry,
  type AiAssistantTurnProcessedEventToolCall,
  type AiAssistantTurnProcessedEventPayload,
} from '../events/ai-assistant-turn-processed.event';

interface AiAssistantTurnProcessedTelemetrySummary {
  llmCalls: number;
  toolCalls: number;
  failedToolCalls: number;
  lastFinishReason?: string;
  totalUsage: ModelUsageTotals;
}

interface AiAssistantTurnProcessedEventMapperParams {
  projectId: string;
  dataMartId: string;
  userId: string;
  sessionId: string;
  templateId: string | null;
  runId: string;
  userMessageId: string;
  userMessage: string;
  assistantMessageId: string | null;
  assistantMessage: string;
  agentResponse?: AiAssistantResponse | null;
  status: DataMartRunStatus.SUCCESS | DataMartRunStatus.FAILED;
  assistantStatus?: AiAssistantResponse['status'];
  decision?: AiAssistantResponse['decision'];
  reasonDescription?: string;
  sql?: string | null;
  resolvedContext?: AiAssistantResponse['resolvedContext'];
  error?: string;
  proposedActions: AssistantProposedAction[];
  telemetry: AgentTelemetry;
  telemetrySummary: AiAssistantTurnProcessedTelemetrySummary;
}

@Injectable()
export class AiAssistantTurnProcessedEventMapper {
  toEvent(params: AiAssistantTurnProcessedEventMapperParams): AiAssistantTurnProcessedEvent {
    const assistantStatus = params.assistantStatus ?? params.agentResponse?.status ?? 'error';
    const decision = params.decision ?? params.agentResponse?.decision ?? 'clarify';
    const reasonDescription =
      params.reasonDescription ?? params.agentResponse?.meta.reasonDescription;
    const sql = params.sql ?? params.agentResponse?.result?.sqlCandidate;
    const { contextResolution: _contextResolution, ...resolvedContext } =
      params.resolvedContext ?? params.agentResponse?.resolvedContext ?? {};
    const payload: AiAssistantTurnProcessedEventPayload = {
      projectId: params.projectId,
      dataMartId: params.dataMartId,
      userId: params.userId,
      sessionId: params.sessionId,
      templateId: params.templateId,
      runId: params.runId,
      turnId: params.userMessageId,
      userMessageId: params.userMessageId,
      assistantMessageId: params.assistantMessageId,
      assistantStatus,
      status: params.status,
      decision,
      reasonDescription,
      userMessage: params.userMessage,
      assistantMessage: params.assistantMessage,
      hasSqlCandidate: typeof sql === 'string' && sql.length > 0,
      proposedActionTypes: params.proposedActions.map(action => action.type),
      proposedActionCount: params.proposedActions.length,
      meta: {
        reasonDescription,
        telemetry: this.mapTelemetry(params.telemetry),
        totalUsage: params.telemetrySummary.totalUsage,
        totalUsageByModel: getPromptTotalUsageByModels(params.telemetry.llmCalls),
        llmCalls: params.telemetrySummary.llmCalls,
        toolCalls: params.telemetrySummary.toolCalls,
        failedToolCalls: params.telemetrySummary.failedToolCalls,
        lastFinishReason: params.telemetrySummary.lastFinishReason,
      },
      ...(params.error ? { error: params.error } : {}),
      ...(sql ? { sql } : {}),
      ...(Object.keys(resolvedContext).length > 0 ? { resolvedContext } : {}),
    };

    return new AiAssistantTurnProcessedEvent(payload);
  }

  private mapTelemetry(telemetry: AgentTelemetry): AiAssistantTurnProcessedEventTelemetry {
    return {
      llmCalls: telemetry.llmCalls,
      toolCalls: telemetry.toolCalls.map(toolCall => this.mapToolCall(toolCall)),
      ...(telemetry.prefetch ? { prefetch: telemetry.prefetch } : {}),
    };
  }

  private mapToolCall(
    toolCall: AgentTelemetry['toolCalls'][number]
  ): AiAssistantTurnProcessedEventToolCall {
    return {
      turn: toolCall.turn,
      name: toolCall.name,
      args: this.parseJsonString(toolCall.argsJson),
      success: toolCall.success,
      ...(toolCall.errorMessage ? { errorMessage: toolCall.errorMessage } : {}),
    };
  }

  private parseJsonString(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
