import { AI_CHAT_PROVIDER } from '../../common/ai-insights/services/ai-chat-provider.token';
import { Inject, Injectable } from '@nestjs/common';
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

@Injectable()
export class AiInsightsOrchestratorService {
  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly triageAgent: TriageAgent,
    private readonly planAgent: PlanAgent,
    private readonly sqlAgent: SqlAgent,
    private readonly finalizeAgent: FinalizeAgent
  ) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    const budgets: AgentBudgets = {
      maxRows: request.options?.maxRows,
      maxBytesProcessed: request.options?.maxBytesProcessed,
    };

    const telemetry: AgentTelemetry = {
      llmCalls: [],
      toolCalls: [],
      messageHistory: [],
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

      return this.buildAnswerPromptResponse(finalizeStruct, telemetry, request);
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

      return this.buildAnswerPromptResponse(finalizeStruct, telemetry, request);
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
      return this.buildAnswerPromptResponse(finalizeStruct, telemetry, request);
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

    return this.buildAnswerPromptResponse(finalize, telemetry, request);
  }

  private buildAnswerPromptResponse(
    finalize: FinalizeResult,
    telemetry: AgentTelemetry,
    request: AnswerPromptRequest
  ): AnswerPromptResponse {
    return {
      promptAnswer: finalize.promptAnswer,
      status: mapFinalReasonToPromptAnswer(finalize.status),
      meta: {
        prompt: request.prompt,
        artifact: finalize.artifact,
        reasonDescription: finalize.reasonDescription,
        telemetry,
      },
    };
  }
}
