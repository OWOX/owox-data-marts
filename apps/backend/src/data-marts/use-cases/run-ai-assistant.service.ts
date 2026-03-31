import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClsContextService } from '../../common/logger/cls-context.service';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import { castError, formatDuration, type OwoxProducer } from '@owox/internal-helpers';
import {
  MeasuredExecutionResult,
  measureExecutionTime,
  toMeasuredExecutionBaseResult,
} from '../../common/utils/measure-execution-time';
import {
  AI_ASSISTANT_LOG_CONTEXT,
  AiAssistantLogContext,
} from '../ai-insights/ai-assistant-log-context';
import { AiAssistantRunLogger } from '../ai-insights/agent-flow/ai-assistant-run-logger';
import {
  normalizeAgentTelemetry,
  createTelemetry,
  summarizeAgentTelemetry,
} from '../ai-insights/agent-flow/agent-telemetry.utils';
import { AgentFlowService } from '../ai-insights/agent-flow/agent-flow.service';
import {
  AiAssistantResponse,
  AssistantProposedActionsSchema,
} from '../ai-insights/agent-flow/ai-assistant-types';
import { AgentFlowRequest } from '../ai-insights/agent-flow/types';
import type { AiAssistantMessage } from '../entities/ai-assistant-message.entity';
import type { AiAssistantSession } from '../entities/ai-assistant-session.entity';
import type { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantTurnProcessedEventMapper } from '../mappers/ai-assistant-turn-processed-event.mapper';
import { AgentFlowContextManager } from '../services/agent-flow-context-manager.service';
import { AiAssistantSessionService } from '../services/ai-assistant-session.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';

const DEFAULT_AI_ASSISTANT_MAX_ROWS = 101;

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
  response: AiAssistantResponse;
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
    private readonly aiAssistantTurnProcessedEventMapper: AiAssistantTurnProcessedEventMapper,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly systemTimeService: SystemTimeService,
    private readonly clsContextService: ClsContextService
  ) {}

  async run(command: RunAiAssistantCommand): Promise<RunAiAssistantResult> {
    return this.clsContextService.runWithContext(
      AI_ASSISTANT_LOG_CONTEXT,
      this.buildInitialLogContext(command),
      () => this.runMeasured(() => this.runCommand(command))
    );
  }

  private async runCommand(command: RunAiAssistantCommand): Promise<RunAiAssistantResult> {
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
    const userMessage = sessionMessages.find(message => message.id === command.userMessageId);

    this.clsContextService.update(AI_ASSISTANT_LOG_CONTEXT, { templateId: session.templateId });

    const run = await this.dataMartRunService.createAndMarkAiSourceRunAsPending(dataMart, session, {
      createdById: command.userId,
      runType: RunType.manual,
      turnId: command.userMessageId,
    });
    this.clsContextService.update(AI_ASSISTANT_LOG_CONTEXT, { runId: run.id });

    await this.dataMartRunService.markAiSourceRunAsStarted(run);

    const runLogger = new AiAssistantRunLogger(this.systemTimeService);

    runLogger.pushLog({
      type: 'log',
      message: 'AI assistant started',
      sessionId: command.sessionId,
      turnId: command.userMessageId,
    });

    return this.completeAssistantTurn({
      command,
      session,
      sessionMessages,
      userMessageContent: userMessage?.content ?? '',
      run,
      runLogger,
    });
  }

  private async completeAssistantTurn(params: {
    command: RunAiAssistantCommand;
    session: AiAssistantSession;
    sessionMessages: AiAssistantMessage[];
    userMessageContent: string;
    run: DataMartRun;
    runLogger: AiAssistantRunLogger;
  }): Promise<RunAiAssistantResult> {
    const { command, session, sessionMessages, userMessageContent, run, runLogger } = params;
    let agentResponse: AiAssistantResponse | null = null;
    let telemetry = createTelemetry();
    let telemetrySummary = summarizeAgentTelemetry(telemetry);
    let validatedProposedActions: ReturnType<typeof AssistantProposedActionsSchema.parse> | null =
      null;
    let assistantMessageContent: string | null = null;
    let assistantMessage: AiAssistantMessage | null = null;

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
        conversationContext: promptContext.conversationContext,
        sessionContext: {
          sessionId: session.id,
          scope: session.scope,
          templateId: session.templateId,
        },
        options: {
          maxRows: DEFAULT_AI_ASSISTANT_MAX_ROWS,
        },
      };

      agentResponse = await this.agentFlowService.run(agentFlowRequest, promptContext);

      runLogger.pushLog({
        type: 'prompt_meta',
        decision: agentResponse.decision,
        status: agentResponse.status,
        reasonDescription: agentResponse.meta.reasonDescription,
        sqlCandidate: agentResponse.result?.sqlCandidate,
      });

      telemetry = normalizeAgentTelemetry(agentResponse.meta.telemetry);
      telemetrySummary = summarizeAgentTelemetry(telemetry);
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

      assistantMessageContent = this.getAssistantMessageContent(agentResponse);
      validatedProposedActions = Array.isArray(agentResponse.proposedActions)
        ? AssistantProposedActionsSchema.parse(agentResponse.proposedActions)
        : null;

      assistantMessage = await this.aiAssistantSessionService.addMessage({
        sessionId: session.id,
        role: AiAssistantMessageRole.ASSISTANT,
        content: assistantMessageContent,
        proposedActions: validatedProposedActions,
        sqlCandidate: agentResponse.result?.sqlCandidate ?? null,
        meta: {
          decision: agentResponse.decision,
          status: agentResponse.status,
          reasonDescription: agentResponse.meta.reasonDescription ?? null,
          runId: run.id,
        },
      });
      this.clsContextService.update(AI_ASSISTANT_LOG_CONTEXT, {
        assistantMessageId: assistantMessage.id,
      });

      const isSuccess = agentResponse.status !== 'error';
      if (!isSuccess) {
        runLogger.pushError({
          error: agentResponse.meta.reasonDescription ?? 'AI assistant failed',
        });
      }

      runLogger.pushLog({
        type: 'log',
        message: 'AI assistant completed',
        status: agentResponse.status,
      });

      const finalStatus = isSuccess ? DataMartRunStatus.SUCCESS : DataMartRunStatus.FAILED;

      await this.dataMartRunService.markAiSourceRunAsFinished(run, {
        status: finalStatus,
        logs: runLogger.logs,
        errors: runLogger.errors,
      });

      await this.producer.produceEvent(
        this.aiAssistantTurnProcessedEventMapper.toEvent({
          projectId: command.projectId,
          dataMartId: command.dataMartId,
          userId: command.userId,
          sessionId: session.id,
          templateId: session.templateId ?? null,
          runId: run.id,
          userMessageId: command.userMessageId,
          userMessage: userMessageContent,
          assistantMessageId: assistantMessage.id,
          assistantMessage: assistantMessage.content,
          agentResponse,
          status: finalStatus,
          proposedActions: validatedProposedActions ?? [],
          telemetry,
          telemetrySummary,
        })
      );

      return {
        runId: run.id,
        response: agentResponse,
        assistantMessageId: assistantMessage.id,
      };
    } catch (error) {
      const castedError = castError(error);
      runLogger.pushError({ error: castedError.message });
      runLogger.pushLog({
        type: 'log',
        message: 'AI assistant failed',
      });

      await this.dataMartRunService.markAiSourceRunAsFinished(run, {
        status: DataMartRunStatus.FAILED,
        logs: runLogger.logs,
        errors: runLogger.errors,
      });

      this.logger.error('AI assistant failed', castedError.stack, {
        errorMessage: castedError.message,
      });

      const failedAssistantMessageContent =
        assistantMessage?.content ??
        assistantMessageContent ??
        this.getFallbackAssistantErrorText();

      await this.producer.produceEvent(
        this.aiAssistantTurnProcessedEventMapper.toEvent({
          projectId: command.projectId,
          dataMartId: command.dataMartId,
          userId: command.userId,
          sessionId: session.id,
          templateId: session.templateId ?? null,
          runId: run.id,
          userMessageId: command.userMessageId,
          userMessage: userMessageContent,
          assistantMessageId: assistantMessage?.id ?? null,
          assistantMessage: failedAssistantMessageContent,
          agentResponse,
          status: DataMartRunStatus.FAILED,
          assistantStatus: 'error',
          decision: agentResponse?.decision ?? 'clarify',
          reasonDescription: castedError.message,
          sql: agentResponse?.result?.sqlCandidate,
          resolvedContext: agentResponse?.resolvedContext,
          error: castedError.message,
          proposedActions: validatedProposedActions ?? [],
          telemetry,
          telemetrySummary,
        })
      );

      throw error;
    }
  }

  private buildInitialLogContext(command: RunAiAssistantCommand): AiAssistantLogContext {
    return {
      projectId: command.projectId,
      dataMartId: command.dataMartId,
      userId: command.userId,
      sessionId: command.sessionId,
      userMessageId: command.userMessageId,
    };
  }

  private async runMeasured<T>(callable: () => Promise<T>): Promise<T> {
    const measured = await measureExecutionTime(callable, {
      onMeasured: (measuredExecution: MeasuredExecutionResult<T>) => {
        this.logger.log('AiAssistantRunTime', {
          measured: toMeasuredExecutionBaseResult(measuredExecution),
        });
      },
    });

    return measured.result;
  }

  private getAssistantMessageContent(agentResponse: AiAssistantResponse): string {
    return (
      agentResponse.explanation ??
      agentResponse.meta.reasonDescription ??
      (agentResponse.status === 'ok'
        ? 'SQL candidate is ready.'
        : this.getFallbackAssistantErrorText())
    );
  }

  private getFallbackAssistantErrorText(): string {
    return 'Unable to process request. Try again later.';
  }
}
