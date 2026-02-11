import { AI_CHAT_PROVIDER } from '../../common/ai-insights/services/ai-chat-provider.token';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ToolRegistry } from '../../common/ai-insights/agent/tool-registry';
import { AiChatProvider } from '../../common/ai-insights/agent/ai-core';
import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  GetMetadataOutput,
  SharedAgentContext,
} from './ai-insights-types';
import { AgentBudgets, AgentTelemetry } from '../../common/ai-insights/agent/types';
import { TriageAgent } from './agent/triage.agent';
import { PlanAgent } from './agent/plan.agent';
import { SqlAgent } from './agent/sql.agent';
import { FinalizeAgent } from './agent/finalize.agent';
import { buildNarrowMetadata } from './utils/narrow-datamart-metadata';
import {
  FinalizeResult,
  FinalReason,
  isSqlExecutionErrorStatus,
  isTriageOutcomeNotOk,
  SqlAgentResult,
  TriageOutcome,
} from './agent/types';
import { mapFinalReasonToPromptAnswer } from './mappers/map-final-reason-to-prompt-answer';
import {
  PromptSanitizerService,
  PromptSanitizeResult,
} from '../../common/ai-insights/services/prompt-sanitizer.service';
import { AiContentFilterError } from '../../common/ai-insights/services/error';

@Injectable()
export class AiInsightsOrchestratorService {
  private readonly logger = new Logger(AiInsightsOrchestratorService.name);
  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly triageAgent: TriageAgent,
    private readonly planAgent: PlanAgent,
    private readonly sqlAgent: SqlAgent,
    private readonly finalizeAgent: FinalizeAgent,
    private readonly promptSanitizer: PromptSanitizerService
  ) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    const originalPrompt = request.prompt;
    let prompt = originalPrompt;
    let sanitizeResult: PromptSanitizeResult | null = null;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const telemetry = this.createTelemetry();
      this.appendSanitizeTelemetry(telemetry, sanitizeResult);

      try {
        return await this.runAgents({ ...request, prompt }, telemetry, originalPrompt);
      } catch (error: unknown) {
        if (!(error instanceof AiContentFilterError) || attempt >= maxAttempts - 1) {
          throw error;
        }

        const basePrompt = prompt;
        sanitizeResult = await this.promptSanitizer.sanitizePrompt(basePrompt);
        const sanitizedPrompt = sanitizeResult?.prompt;
        if (!sanitizedPrompt || sanitizedPrompt.trim() === basePrompt.trim()) {
          throw error;
        }
        this.logger.log('Prompt was sanitized successfully', {
          originalPrompt,
          sanitizedPrompt,
          projectId: request.projectId,
          dataMartId: request.dataMartId,
        });
        prompt = sanitizedPrompt;
      }
    }

    throw new Error('Prompt processing failed after sanitization retry');
  }

  private async runAgents(
    request: AnswerPromptRequest,
    telemetry: AgentTelemetry,
    originalPrompt: string
  ): Promise<AnswerPromptResponse> {
    const budgets: AgentBudgets = {
      maxRows: request.options?.maxRows,
      maxBytesProcessed: request.options?.maxBytesProcessed,
    };

    const shared: SharedAgentContext = {
      aiProvider: this.aiProvider,
      toolRegistry: this.toolRegistry,
      budgets,
      telemetry,
      projectId: request.projectId,
      dataMartId: request.dataMartId,
    };

    const triage = await this.triageAgent.run({ prompt: request.prompt }, shared);

    if (isTriageOutcomeNotOk(triage.outcome)) {
      const finalizeStruct: FinalizeResult = {
        status:
          triage.outcome === TriageOutcome.NOT_RELEVANT
            ? FinalReason.NOT_RELEVANT
            : FinalReason.CANNOT_ANSWER,
        reasonDescription: triage.reasonText,
      };

      return this.buildAnswerPromptResponse(
        finalizeStruct,
        telemetry,
        originalPrompt,
        request.prompt
      );
    }

    const planResult = await this.planAgent.run(
      {
        prompt: request.prompt,
        promptLanguage: triage.promptLanguage,
        schemaSummary: triage.schemaSummary,
        rawSchema: triage.rawSchema,
      },
      shared
    );

    if (planResult.maybeAmbiguous) {
      const finalizeStruct: FinalizeResult = {
        status: FinalReason.HIGH_AMBIGUITY,
        reasonDescription: planResult.ambiguityExplanation!,
      };

      return this.buildAnswerPromptResponse(
        finalizeStruct,
        telemetry,
        originalPrompt,
        request.prompt
      );
    }

    const narrowedMetadata: GetMetadataOutput = buildNarrowMetadata(
      planResult.plan,
      triage.rawSchema!
    );

    const sqlResult: SqlAgentResult = await this.sqlAgent.run(
      {
        prompt: request.prompt,
        plan: planResult.plan,
        schemaSummary: triage.schemaSummary,
        rawSchema: narrowedMetadata,
      },
      shared
    );

    if (isSqlExecutionErrorStatus(sqlResult.status)) {
      const finalizeStruct: FinalizeResult = {
        status: FinalReason.SQL_ERROR,
        artifact: sqlResult.sql,
        reasonDescription: `${sqlResult.sqlError}\nSuggestion:\n${sqlResult.sqlErrorSuggestion}`,
      };
      return this.buildAnswerPromptResponse(
        finalizeStruct,
        telemetry,
        originalPrompt,
        request.prompt
      );
    }

    const finalize: FinalizeResult = await this.finalizeAgent.run(
      {
        prompt: request.prompt,
        promptLanguage: triage.promptLanguage,
        wholeTemplate: request.wholeTemplate,
        sqlAgentResult: sqlResult,
      },
      shared
    );

    return this.buildAnswerPromptResponse(finalize, telemetry, originalPrompt, request.prompt);
  }

  private buildAnswerPromptResponse(
    finalize: FinalizeResult,
    telemetry: AgentTelemetry,
    originalPrompt: string,
    sanitizedPrompt: string
  ): AnswerPromptResponse {
    return {
      promptAnswer: finalize.promptAnswer,
      status: mapFinalReasonToPromptAnswer(finalize.status),
      meta: {
        prompt: originalPrompt,
        sanitizedPrompt: originalPrompt === sanitizedPrompt ? null : sanitizedPrompt,
        artifact: finalize.artifact,
        reasonDescription: finalize.reasonDescription,
        telemetry,
      },
    };
  }

  private createTelemetry(): AgentTelemetry {
    return {
      llmCalls: [],
      toolCalls: [],
      messageHistory: [],
    };
  }

  private appendSanitizeTelemetry(
    telemetry: AgentTelemetry,
    sanitizeResult: PromptSanitizeResult | null
  ): void {
    if (!sanitizeResult?.usage) {
      return;
    }

    telemetry.llmCalls.push({
      turn: 0,
      model: sanitizeResult.model,
      finishReason: sanitizeResult.finishReason,
      usage: sanitizeResult.usage,
      reasoningPreview: 'prompt_sanitizer',
    });
  }
}
