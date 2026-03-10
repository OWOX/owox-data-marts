import { z } from 'zod';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentFlowContext } from '../types';
import { AiAssistantSqlOrchestratorService } from '../ai-assistant-sql-orchestrator.service';
import { AssistantChatMessage, AiAssistantResponse } from '../ai-assistant-types';
import { appendNormalizedTelemetry } from '../agent-telemetry.utils';
import { AgentFlowRequestMapper } from '../../../mappers/agent-flow-request.mapper';
import {
  getLastUserMessage,
  replaceLastUserMessage as replaceLastUserMessageInHistory,
} from '../ai-assistant-orchestrator.utils';
import {
  BaseSqlHandleResolverService,
  BaseSqlHandleKind,
} from '../base-sql-handle-resolver.service';

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
  mode: z.literal('refine').describe('Refine an existing SQL query.'),
  baseSqlHandle: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Preferred. Opaque handle to base SQL returned by state snapshot or source tools. ' +
        'Examples: rev:<assistantMessageId>, src:<templateSourceId>.'
    ),
  baseSqlText: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Fallback raw SQL text to refine when no persisted baseSqlHandle exists. ' +
        'Use this only when the user explicitly provided SQL text.'
    ),
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
    'Use mode="refine" with baseSqlHandle + refineInstructions in normal cases. ' +
    'Use baseSqlText + refineInstructions only when the user explicitly pasted SQL.',
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
    baseSqlHandle: {
      type: 'string',
      description:
        'Preferred when mode="refine". Opaque handle returned by tools/state snapshot. ' +
        'Examples: rev:<assistantMessageId>, src:<templateSourceId>.',
    },
    baseSqlText: {
      type: 'string',
      description:
        'Fallback when mode="refine". Raw SQL to refine if no persisted handle exists ' +
        '(for example, user pasted SQL in chat). Prefer baseSqlHandle when available.',
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
  diagnostics?: AiAssistantResponse['meta']['diagnostics'];
}

interface ResolvedBaseSql {
  baseSql: string;
  baseAssistantMessageId?: string;
  origin: { type: 'handle'; handle: string; kind: BaseSqlHandleKind } | { type: 'text' };
}

@Injectable()
export class GenerateSqlTool {
  private readonly logger = new Logger(GenerateSqlTool.name);

  constructor(
    private readonly orchestrator: AiAssistantSqlOrchestratorService,
    private readonly agentFlowRequestMapper: AgentFlowRequestMapper,
    private readonly baseSqlHandleResolverService: BaseSqlHandleResolverService
  ) {}

  async execute(args: GenerateSqlInput, context: AgentFlowContext): Promise<GenerateSqlOutput> {
    const { request } = context;

    const { delegatedRequest, baseAssistantMessageId, hasBaseSql, refineBaseOrigin } =
      await this.buildDelegatedRequest(args, request);
    this.logger.debug('AiAssistant | Request', { request, delegatedRequest });

    const response = await this.orchestrator.run(delegatedRequest, args.mode);

    this.logger.log('AiAssistant | Response', {
      status: response.status,
      decision: response.decision,
      mode: args.mode,
      refineBaseOrigin: args.mode === 'refine' ? refineBaseOrigin : undefined,
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
  ): Promise<{
    delegatedRequest: ReturnType<AgentFlowRequestMapper['toAssistantSqlOrchestratorRequest']>;
    baseAssistantMessageId?: string;
    hasBaseSql: boolean;
    refineBaseOrigin?: ResolvedBaseSql['origin'];
  }> {
    if (args.mode === 'refine') {
      const base = await this.resolveBaseSqlForRefine(args, request);
      const delegatedTurns = this.replaceLastUserMessageOrThrow(
        request.conversationContext.turns,
        args.refineInstructions
      );
      const conversationContext = this.agentFlowRequestMapper.toAgentConversationContext({
        request,
        mode: 'refine',
        turns: delegatedTurns,
        currentSourceSql: base.baseSql,
      });

      return {
        delegatedRequest: this.agentFlowRequestMapper.toAssistantSqlOrchestratorRequest({
          request,
          conversationContext,
        }),
        baseAssistantMessageId: base.baseAssistantMessageId,
        hasBaseSql: true,
        refineBaseOrigin: base.origin,
      };
    }

    const delegatedTurns = args.taskPrompt
      ? this.replaceLastUserMessageOrThrow(request.conversationContext.turns, args.taskPrompt)
      : request.conversationContext.turns;
    const conversationContext = this.agentFlowRequestMapper.toAgentConversationContext({
      request,
      mode: 'create',
      turns: delegatedTurns,
    });

    return {
      delegatedRequest: this.agentFlowRequestMapper.toAssistantSqlOrchestratorRequest({
        request,
        conversationContext,
      }),
      baseAssistantMessageId: undefined,
      hasBaseSql: false,
      refineBaseOrigin: undefined,
    };
  }

  private async resolveBaseSqlForRefine(
    args: Extract<GenerateSqlInput, { mode: 'refine' }>,
    request: AgentFlowContext['request']
  ): Promise<ResolvedBaseSql> {
    if (typeof args.baseSqlHandle === 'string') {
      return this.baseSqlHandleResolverService.resolve(args.baseSqlHandle, request);
    }

    if (typeof args.baseSqlText === 'string') {
      return {
        baseSql: args.baseSqlText.trim(),
        origin: { type: 'text' },
      };
    }

    throw new BadRequestException('Refine mode requires baseSqlHandle or baseSqlText');
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
