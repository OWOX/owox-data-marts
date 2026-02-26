import { Injectable, Logger } from '@nestjs/common';
import { formatDuration } from '@owox/internal-helpers';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import {
  summarizeAgentTelemetry,
  normalizeAgentTelemetry,
} from '../ai-insights/agent-flow/agent-telemetry.utils';
import { AiAssistantRunLogger } from '../ai-insights/agent-flow/ai-assistant-run-logger';
import { AgentFlowService } from '../ai-insights/agent-flow/agent-flow.service';
import { AgentFlowRequest } from '../ai-insights/agent-flow/types';
import { AssistantOrchestratorResponse } from '../ai-insights/agent-flow/ai-assistant-types';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { AgentFlowContextManager } from '../services/agent-flow-context-manager.service';
import { castError } from '@owox/internal-helpers';

export class RunAiAssistantCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly sessionId: string,
    public readonly userId: string,
    public readonly userMessageId: string
  ) {}
}

export interface RunAiAssistantResult {
  runId: string;
  response: AssistantOrchestratorResponse;
  assistantMessageId: string | null;
}

@Injectable()
export class RunAiAssistantService {
  private readonly logger = new Logger(RunAiAssistantService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly agentFlowService: AgentFlowService,
    private readonly agentFlowContextManager: AgentFlowContextManager,
    private readonly systemTimeService: SystemTimeService
  ) {}

  async run(command: RunAiAssistantCommand): Promise<RunAiAssistantResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const session = await this.aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId(
      command.sessionId,
      command.dataMartId,
      command.projectId,
      command.userId
    );

    const sessionMessages =
      await this.aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId(
        session.id,
        command.dataMartId,
        command.projectId,
        command.userId
      );

    const run = await this.dataMartRunService.createAndMarkAiSourceRunAsPending(dataMart, session, {
      createdById: command.userId,
      runType: RunType.manual,
      turnId: command.userMessageId,
    });

    await this.dataMartRunService.markAiSourceRunAsStarted(run);

    const runLogger = new AiAssistantRunLogger(this.systemTimeService);
    let assistantMessageId: string | null = null;

    runLogger.pushLog({
      type: 'log',
      message: 'AI Source turn started',
      sessionId: command.sessionId,
      turnId: command.userMessageId,
    });

    try {
      const promptContext = await this.agentFlowContextManager.buildPromptContext({
        session,
        dataMartId: command.dataMartId,
        projectId: command.projectId,
        userId: command.userId,
        sessionMessages,
      });

      const agentFlowRequest: AgentFlowRequest = {
        projectId: command.projectId,
        dataMartId: command.dataMartId,
        history: promptContext.recentTurns,
        sessionContext: {
          sessionId: session.id,
          scope: session.scope,
          templateId: session.templateId,
        },
      };

      const agentResponse = await this.agentFlowService.run(agentFlowRequest, promptContext);

      runLogger.pushLog({
        type: 'prompt_meta',
        decision: agentResponse.decision,
        status: agentResponse.status,
        reasonDescription: agentResponse.meta.reasonDescription,
        sqlCandidate: agentResponse.result?.sqlCandidate,
      });

      const telemetry = normalizeAgentTelemetry(agentResponse.meta.telemetry);
      const telemetrySummary = summarizeAgentTelemetry(telemetry);
      const { executionTime, ...usage } = telemetrySummary.totalUsage;
      runLogger.pushLog({
        type: 'prompt_telemetry',
        llmCalls: telemetrySummary.llmCalls,
        toolCalls: telemetrySummary.toolCalls,
        failedToolCalls: telemetrySummary.failedToolCalls,
        lastFinishReason: telemetrySummary.lastFinishReason,
        totalUsage: {
          ...usage,
          executionTime: formatDuration(executionTime),
        },
      });

      const lastLlm = telemetry.llmCalls.length
        ? telemetry.llmCalls[telemetry.llmCalls.length - 1]
        : undefined;
      if (lastLlm?.reasoningPreview) {
        runLogger.pushLog({
          type: 'prompt_reasoning_preview',
          preview: lastLlm.reasoningPreview,
        });
      }

      const assistantMessage = await this.aiAssistantSessionService.addMessage({
        sessionId: session.id,
        role: AiAssistantMessageRole.ASSISTANT,
        content:
          agentResponse.explanation ??
          agentResponse.meta.reasonDescription ??
          (agentResponse.status === 'ok'
            ? 'SQL candidate is ready.'
            : 'Unable to process request.'),
        proposedActions: agentResponse.proposedActions ?? null,
        sqlCandidate: agentResponse.result?.sqlCandidate ?? null,
        meta: {
          decision: agentResponse.decision,
          status: agentResponse.status,
          reasonDescription: agentResponse.meta.reasonDescription ?? null,
          runId: run.id,
        },
      });
      assistantMessageId = assistantMessage.id;

      const isSuccess = agentResponse.status !== 'error';
      if (!isSuccess) {
        runLogger.pushError({
          error: agentResponse.meta.reasonDescription ?? 'AI source orchestration failed',
        });
      }

      runLogger.pushLog({
        type: 'log',
        message: 'AI flow completed',
        status: agentResponse.status,
      });

      await this.dataMartRunService.markAiSourceRunAsFinished(run, {
        status: isSuccess ? DataMartRunStatus.SUCCESS : DataMartRunStatus.FAILED,
        logs: runLogger.logs,
        errors: runLogger.errors,
      });

      return {
        runId: run.id,
        response: agentResponse,
        assistantMessageId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runLogger.pushError({ error: message });
      runLogger.pushLog({
        type: 'log',
        message: 'AI Source heavy turn failed',
      });

      await this.dataMartRunService.markAiSourceRunAsFinished(run, {
        status: DataMartRunStatus.FAILED,
        logs: runLogger.logs,
        errors: runLogger.errors,
      });

      this.logger.error(`AI Source heavy turn failed: ${message}`, castError(error).stack, {
        dataMartId: command.dataMartId,
        projectId: command.projectId,
        sessionId: command.sessionId,
        runId: run.id,
        userId: command.userId,
      });

      throw error;
    }
  }
}
