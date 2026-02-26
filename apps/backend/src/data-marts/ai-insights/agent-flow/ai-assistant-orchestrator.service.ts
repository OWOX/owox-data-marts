import { Inject, Injectable, Logger } from '@nestjs/common';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { AI_CHAT_PROVIDER } from '../../../common/ai-insights/services/ai-chat-provider.token';
import { AiChatProvider } from '../../../common/ai-insights/agent/ai-core';
import { AgentBudgets, AgentTelemetry } from '../../../common/ai-insights/agent/types';
import { AiContentFilterError } from '../../../common/ai-insights/services/error';
import { TriageAgent } from '../agent/triage.agent';
import { PlanAgent } from '../agent/plan.agent';
import { QueryRepairAgent } from '../agent/query-repair.agent';
import { SqlBuilderAgent } from '../agent/sql-builder.agent';
import { QueryRepairAction, QueryRepairAttempt, QueryPlan, TriageOutcome } from '../agent/types';
import {
  DataMartInsightsContext,
  GetMetadataOutput,
  SharedAgentContext,
  SqlErrorKind,
} from '../ai-insights-types';
import { buildNarrowMetadata } from '../utils/narrow-datamart-metadata';
import { SqlDryRunCommand } from '../../dto/domain/sql-dry-run.command';
import { SqlDryRunService } from '../../use-cases/sql-dry-run.service';
import {
  AssistantChatMessage,
  AssistantMatchDebug,
  AssistantOrchestratorRequest,
  AssistantOrchestratorResponse,
  AssistantOrchestratorStatus,
} from './ai-assistant-types';

import { getLastUserMessage } from './ai-assistant-orchestrator.utils';
import { createTelemetry, mergeTelemetry } from './agent-telemetry.utils';

interface SqlDryRunValidationFailure {
  kind: SqlErrorKind;
  message: string;
  bytes?: number;
}

interface SqlCandidateBuildResult {
  status: AssistantOrchestratorStatus;
  sqlCandidate: string;
  dryRun: { isValid: boolean; error?: string; bytes?: number };
  repairAttempts: number;
  diagnostics?: {
    warnings?: string[];
    assumptions?: string[];
  };
  reasonDescription?: string;
}

type SqlOrchestratorMode = 'refine' | 'create';

@Injectable()
export class AiAssistantOrchestratorService {
  private readonly logger = new Logger(AiAssistantOrchestratorService.name);

  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly triageAgent: TriageAgent,
    private readonly planAgent: PlanAgent,
    private readonly sqlBuilderAgent: SqlBuilderAgent,
    private readonly queryRepairAgent: QueryRepairAgent,
    private readonly sqlDryRunService: SqlDryRunService
  ) {}

  async run(
    request: AssistantOrchestratorRequest,
    mode: SqlOrchestratorMode,
    options?: { prefillTelemetry?: AgentTelemetry }
  ): Promise<AssistantOrchestratorResponse> {
    const originalLastUserMessage = getLastUserMessage(request.history);
    const prefillTelemetry = options?.prefillTelemetry;
    const telemetry = createTelemetry();
    mergeTelemetry(telemetry, prefillTelemetry);

    try {
      return await this.runFlow({
        request,
        mode,
        telemetry,
        history: request.history,
        originalLastUserMessage,
        sanitizedLastUserMessage: null,
      });
    } catch (error: unknown) {
      if (error instanceof AiContentFilterError) {
        return this.buildRestrictedResponse(request, mode, null, telemetry);
      }

      return this.buildErrorResponse(
        request,
        mode,
        null,
        telemetry,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async runFlow(params: {
    request: AssistantOrchestratorRequest;
    mode: SqlOrchestratorMode;
    telemetry: AgentTelemetry;
    history: AssistantChatMessage[];
    originalLastUserMessage: string;
    sanitizedLastUserMessage: string | null;
  }): Promise<AssistantOrchestratorResponse> {
    const { request, mode, telemetry, history, sanitizedLastUserMessage } = params;
    const decision = this.toDecision(mode);

    const prompt = this.buildPromptFromHistory(
      history,
      request.sessionContext.currentArtifactSql,
      mode
    );
    const shared = this.createSharedContext(request, prompt, telemetry);
    const triage = await this.triageAgent.run({ prompt }, shared);
    if (triage.outcome !== TriageOutcome.OK) {
      const status: AssistantOrchestratorStatus =
        triage.outcome === TriageOutcome.NOT_RELEVANT ? 'not_relevant' : 'cannot_answer';

      return {
        status,
        decision,
        explanation: triage.reasonText ?? 'This request cannot be processed.',
        debug: this.buildDebugPayload(request),
        meta: {
          sanitizedLastUserMessage,
          reasonDescription: triage.reasonText,
          telemetry,
        },
      };
    }

    const planResult = await this.planAgent.run(
      {
        prompt,
        promptLanguage: triage.promptLanguage,
        schemaSummary: triage.schemaSummary,
        rawSchema: triage.rawSchema,
      },
      shared
    );

    if (planResult.maybeAmbiguous) {
      return {
        status: 'high_ambiguity',
        decision,
        explanation: planResult.ambiguityExplanation ?? 'Request needs clarification.',
        debug: this.buildDebugPayload(request),
        meta: {
          sanitizedLastUserMessage,
          reasonDescription: planResult.ambiguityExplanation,
          telemetry,
        },
      };
    }

    const narrowedMetadata: GetMetadataOutput = buildNarrowMetadata(
      planResult.plan,
      triage.rawSchema!
    );
    const sqlCandidateResult = await this.buildSqlCandidate({
      prompt,
      plan: planResult.plan,
      schemaSummary: triage.schemaSummary,
      rawSchema: narrowedMetadata,
      shared,
      request,
    });

    if (sqlCandidateResult.status !== 'ok') {
      return {
        status: sqlCandidateResult.status,
        decision,
        result: {
          sqlCandidate: sqlCandidateResult.sqlCandidate,
          dryRun: sqlCandidateResult.dryRun,
          repairAttempts: sqlCandidateResult.repairAttempts,
        },
        explanation:
          sqlCandidateResult.reasonDescription ?? 'Unable to produce valid SQL candidate.',
        debug: this.buildDebugPayload(request),
        meta: {
          sanitizedLastUserMessage,
          reasonDescription: sqlCandidateResult.reasonDescription,
          telemetry,
          diagnostics: sqlCandidateResult.diagnostics,
        },
      };
    }

    return {
      status: 'ok',
      decision,
      result: {
        sqlCandidate: sqlCandidateResult.sqlCandidate,
        dryRun: sqlCandidateResult.dryRun,
        repairAttempts: sqlCandidateResult.repairAttempts,
      },
      proposedActions: [],
      debug: this.buildDebugPayload(request),
      meta: {
        sanitizedLastUserMessage,
        reasonDescription: sqlCandidateResult.reasonDescription,
        telemetry,
        diagnostics: sqlCandidateResult.diagnostics,
      },
    };
  }

  private async buildSqlCandidate(params: {
    prompt: string;
    plan: QueryPlan;
    schemaSummary?: string;
    rawSchema: GetMetadataOutput;
    shared: SharedAgentContext;
    request: AssistantOrchestratorRequest;
  }): Promise<SqlCandidateBuildResult> {
    const { prompt, plan, schemaSummary, rawSchema, shared, request } = params;
    const maxRepairAttempts = 4;
    const attempts: QueryRepairAttempt[] = [];
    let sql = (
      await this.sqlBuilderAgent.run(
        {
          prompt,
          plan,
          schemaSummary,
          rawSchema,
        },
        shared
      )
    ).sql;

    let lastFailure: SqlDryRunValidationFailure | null = null;
    let lastDryRun: { isValid: boolean; error?: string; bytes?: number } = {
      isValid: false,
      error: 'Dry run failed',
    };

    for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
      const validation = await this.validateSqlDryRun(shared, sql, request);
      if (validation.ok) {
        return {
          status: 'ok',
          sqlCandidate: sql,
          dryRun: {
            isValid: true,
            bytes: validation.bytes,
          },
          repairAttempts: attempts.length,
          diagnostics:
            attempts.length > 0
              ? {
                  warnings: ['SQL candidate required one or more repair attempts.'],
                }
              : undefined,
          reasonDescription:
            attempts.length > 0
              ? 'SQL candidate generated after repair attempts.'
              : 'SQL candidate generated successfully.',
        };
      }

      lastFailure = validation.error;
      lastDryRun = {
        isValid: false,
        error: validation.error.message,
        bytes: validation.error.bytes,
      };

      attempts.push({
        sql,
        error: {
          kind: validation.error.kind,
          message: validation.error.message,
          bytes: validation.error.bytes,
        },
      });

      if (attempt >= maxRepairAttempts) {
        break;
      }

      const repairResult = await this.queryRepairAgent.run(
        {
          prompt,
          queryPlan: plan,
          schema: rawSchema,
          attempts: attempts.slice(-4),
        },
        shared
      );

      if (repairResult.action === QueryRepairAction.CANNOT_REPAIR) {
        return {
          status: 'error',
          sqlCandidate: sql,
          dryRun: lastDryRun,
          repairAttempts: attempts.length,
          diagnostics: {
            warnings: [repairResult.notes],
          },
          reasonDescription: repairResult.notes,
        };
      }

      sql = repairResult.sql;
    }

    return {
      status: 'error',
      sqlCandidate: sql,
      dryRun: lastDryRun,
      repairAttempts: attempts.length,
      diagnostics: {
        warnings: lastFailure?.message ? [lastFailure.message] : undefined,
      },
      reasonDescription: 'SQL generation failed after repair attempts.',
    };
  }

  private async validateSqlDryRun(
    shared: SharedAgentContext,
    sql: string,
    request: AssistantOrchestratorRequest
  ): Promise<{ ok: true; bytes?: number } | { ok: false; error: SqlDryRunValidationFailure }> {
    const dryRun = await this.sqlDryRunService.run(
      new SqlDryRunCommand(request.dataMartId, request.projectId, sql)
    );

    if (!dryRun.isValid) {
      return {
        ok: false,
        error: {
          kind: SqlErrorKind.DRY_RUN_ERROR,
          message: dryRun.error ?? 'SQL dry-run failed',
          bytes: dryRun.bytes,
        },
      };
    }

    if (
      shared.budgets.maxBytesProcessed != null &&
      dryRun.bytes != null &&
      dryRun.bytes > shared.budgets.maxBytesProcessed
    ) {
      return {
        ok: false,
        error: {
          kind: SqlErrorKind.OVER_BUDGET,
          message: `Estimated bytes ${dryRun.bytes} exceed budget ${shared.budgets.maxBytesProcessed}`,
          bytes: dryRun.bytes,
        },
      };
    }

    return {
      ok: true,
      bytes: dryRun.bytes,
    };
  }

  private buildPromptFromHistory(
    history: AssistantChatMessage[],
    currentArtifactSql: string | undefined,
    mode: SqlOrchestratorMode
  ): string {
    const decision = this.toDecision(mode);
    const historyBlock = history
      .map((message, index) => `[${index + 1}] ${message.role}: ${message.content}`)
      .join('\n');

    const artifactSqlBlock = currentArtifactSql?.trim()
      ? [
          'Current artifact SQL context:',
          '--- CURRENT SQL START ---',
          currentArtifactSql,
          '--- CURRENT SQL END ---',
        ].join('\n')
      : 'Current artifact SQL context: none';

    return [
      `Route: ${decision}`,
      'Conversation history (source of truth):',
      historyBlock,
      artifactSqlBlock,
      'Instruction: build SQL candidate that satisfies latest user intent and conversation context.',
    ].join('\n\n');
  }

  private buildErrorResponse(
    request: AssistantOrchestratorRequest,
    mode: SqlOrchestratorMode,
    sanitizedLastUserMessage: string | null,
    telemetry: AgentTelemetry,
    message: string
  ): AssistantOrchestratorResponse {
    const decision = this.toDecision(mode);
    this.logger.error(`AI source orchestration error: ${message}`);
    return {
      status: 'error',
      decision,
      explanation: 'Unable to process this source request right now.',
      debug: this.buildDebugPayload(request),
      meta: {
        sanitizedLastUserMessage,
        reasonDescription: message,
        telemetry,
      },
    };
  }

  private buildRestrictedResponse(
    request: AssistantOrchestratorRequest,
    mode: SqlOrchestratorMode,
    sanitizedLastUserMessage: string | null,
    telemetry: AgentTelemetry
  ): AssistantOrchestratorResponse {
    const decision = this.toDecision(mode);
    return {
      status: 'restricted',
      decision,
      explanation: 'This request cannot be processed due to content policy restrictions.',
      debug: this.buildDebugPayload(request),
      meta: {
        sanitizedLastUserMessage,
        reasonDescription: 'Blocked by AI content filter.',
        telemetry,
      },
    };
  }

  private buildDebugPayload(
    _request: AssistantOrchestratorRequest,
    extras?: AssistantMatchDebug
  ): AssistantMatchDebug | undefined {
    const hasExtras = Boolean(extras && Object.keys(extras).length > 0);
    if (!hasExtras) {
      return undefined;
    }

    return extras;
  }

  private toDecision(mode: SqlOrchestratorMode): 'refine_existing_sql' | 'create_new_source_sql' {
    return mode === 'refine' ? 'refine_existing_sql' : 'create_new_source_sql';
  }

  private createSharedContext(
    request: AssistantOrchestratorRequest,
    prompt: string,
    telemetry: AgentTelemetry
  ): SharedAgentContext {
    const budgets: AgentBudgets = {
      maxRows: request.options?.maxRows,
      maxBytesProcessed: request.options?.maxBytesProcessed,
    };

    const context: DataMartInsightsContext = {
      projectId: request.projectId,
      dataMartId: request.dataMartId,
      prompt,
      telemetry,
      budgets,
    };

    return {
      aiProvider: this.aiProvider,
      toolRegistry: this.toolRegistry,
      budgets: context.budgets ?? {},
      telemetry,
      projectId: request.projectId,
      dataMartId: request.dataMartId,
    };
  }
}
