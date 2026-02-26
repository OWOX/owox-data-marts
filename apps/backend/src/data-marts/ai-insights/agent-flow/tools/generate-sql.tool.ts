import { z } from 'zod';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentFlowContext } from '../types';
import { AiAssistantOrchestratorService } from '../ai-assistant-orchestrator.service';
import { AssistantChatMessage, AssistantOrchestratorResponse } from '../ai-assistant-types';
import { AiAssistantSessionService } from '../../../services/ai-assistant-session.service';
import { appendNormalizedTelemetry } from '../agent-telemetry.utils';
import { AgentFlowRequestMapper } from '../../../mappers/agent-flow-request.mapper';
import {
  getLastUserMessage,
  replaceLastUserMessage as replaceLastUserMessageInHistory,
} from '../ai-assistant-orchestrator.utils';

const GenerateSqlCreateInputSchema = z.object({
  mode: z.literal('create').describe('Generate new SQL from scratch.'),
  taskPrompt: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Optional scoped subtask when the original user message contains multiple tasks. ' +
        'If provided, generate SQL ONLY for this subtask.'
    ),
});

const GenerateSqlRefineInputSchema = z.object({
  mode: z.literal('refine').describe('Refine previously generated SQL revision.'),
  sqlRevisionId: z
    .string()
    .trim()
    .min(1)
    .describe('Assistant message id that owns the base SQL revision (sqlCandidate).'),
  refineInstructions: z.string().trim().min(1).describe('Specific instructions for refining SQL.'),
});

export const GenerateSqlInputSchema = z.discriminatedUnion('mode', [
  GenerateSqlCreateInputSchema,
  GenerateSqlRefineInputSchema,
]);
export type GenerateSqlInput = z.infer<typeof GenerateSqlInputSchema>;

export const GenerateSqlInputJsonSchema = {
  type: 'object',
  description:
    'Generate or refine SQL. ' +
    'Use mode="create" for new SQL (optionally with taskPrompt for one scoped subtask from a multi-task user message). ' +
    'Use mode="refine" only with sqlRevisionId + refineInstructions.',
  properties: {
    mode: {
      type: 'string',
      enum: ['create', 'refine'],
      description:
        'Required. "create" = generate new SQL. "refine" = modify an existing SQL revision.',
    },
    taskPrompt: {
      type: 'string',
      description:
        'Optional scoped subtask when the original user message has multiple tasks. ' +
        'Use only with mode="create". If provided, generate SQL ONLY for this subtask and ignore other tasks.',
    },
    sqlRevisionId: {
      type: 'string',
      description:
        'Required when mode="refine". Assistant message id containing the base sqlCandidate to refine. ' +
        'Do not send this for mode="create".',
    },
    refineInstructions: {
      type: 'string',
      description:
        'Required when mode="refine". Specific instructions for what to change in SQL. ' +
        'Do not send this for mode="create".',
    },
  },
  required: ['mode'],
  additionalProperties: false,
};

export interface GenerateSqlOutput {
  sqlCandidate: string;
  dryRunValid: boolean;
  dryRunError: string | null;
  repairAttempts: number;
  reasonDescription?: string;
  diagnostics?: AssistantOrchestratorResponse['meta']['diagnostics'];
}

@Injectable()
export class GenerateSqlTool {
  private readonly logger = new Logger(GenerateSqlTool.name);

  constructor(
    private readonly orchestrator: AiAssistantOrchestratorService,
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly agentFlowRequestMapper: AgentFlowRequestMapper
  ) {}

  async execute(args: GenerateSqlInput, context: AgentFlowContext): Promise<GenerateSqlOutput> {
    const { request } = context;

    const { delegatedRequest, baseAssistantMessageId, hasBaseSql } =
      await this.buildDelegatedRequest(args, request);

    const response = await this.orchestrator.run(delegatedRequest, args.mode);

    this.logger.log('GenerateSqlTool: orchestrator response', {
      status: response.status,
      decision: response.decision,
      mode: args.mode,
      sqlRevisionId: args.mode === 'refine' ? args.sqlRevisionId : undefined,
      baseAssistantMessageId,
      hasBaseSql,
    });

    const sqlCandidate = response.result?.sqlCandidate ?? '';
    const dryRun = response.result?.dryRun;
    const dryRunValid = dryRun?.isValid ?? false;
    const reasonDescription = response.meta?.reasonDescription;
    const diagnostics = response.meta?.diagnostics;

    appendNormalizedTelemetry(context.telemetry, response.meta?.telemetry);

    context.lastGeneratedSql = sqlCandidate || undefined;
    context.lastDryRunValid = dryRunValid;
    context.lastGeneratedSqlReasonDescription = reasonDescription;
    context.lastGeneratedSqlDiagnostics = diagnostics;

    return {
      sqlCandidate,
      dryRunValid,
      dryRunError: dryRun?.error ?? null,
      repairAttempts: response.result?.repairAttempts ?? 0,
      ...(reasonDescription ? { reasonDescription } : {}),
      ...(diagnostics ? { diagnostics } : {}),
    };
  }

  private async buildDelegatedRequest(
    args: GenerateSqlInput,
    request: AgentFlowContext['request']
  ) {
    if (args.mode === 'refine') {
      const base = await this.resolveBaseSqlForRefine(
        request.sessionContext.sessionId,
        args.sqlRevisionId
      );

      return {
        delegatedRequest: this.agentFlowRequestMapper.toAssistantOrchestratorRequest({
          request,
          history: this.replaceLastUserMessageOrThrow(request.history, args.refineInstructions),
          currentArtifactSql: base.baseSql,
        }),
        baseAssistantMessageId: base.baseAssistantMessageId,
        hasBaseSql: true,
      };
    }

    return {
      delegatedRequest: this.agentFlowRequestMapper.toAssistantOrchestratorRequest({
        request,
        ...(args.taskPrompt
          ? {
              history: this.replaceLastUserMessageOrThrow(request.history, args.taskPrompt),
            }
          : {}),
      }),
      baseAssistantMessageId: undefined,
      hasBaseSql: false,
    };
  }

  private async resolveBaseSqlForRefine(
    paramsSessionId: string,
    sqlRevisionId: string
  ): Promise<{
    baseAssistantMessageId: string;
    baseSql: string;
  }> {
    const baseMessage = await this.aiAssistantSessionService.getAssistantMessageByIdAndSessionId(
      sqlRevisionId,
      paramsSessionId
    );
    const baseSql =
      typeof baseMessage.sqlCandidate === 'string' ? baseMessage.sqlCandidate.trim() : '';

    if (!baseSql) {
      throw new BadRequestException(
        `SQL revision "${sqlRevisionId}" has empty sqlCandidate and cannot be refined`
      );
    }

    return {
      baseAssistantMessageId: baseMessage.id,
      baseSql,
    };
  }

  private replaceLastUserMessageOrThrow(
    history: AssistantChatMessage[],
    nextUserMessage: string
  ): AssistantChatMessage[] {
    if (!getLastUserMessage(history)) {
      throw new BadRequestException('SQL generation requires at least one user message in history');
    }

    return replaceLastUserMessageInHistory(history, nextUserMessage);
  }
}
