import { z } from 'zod';
import { AiRole } from '../../../common/ai-insights/agent/ai-core';
import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { TemplateEditPlaceholderTagSchema } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags.contracts';
import { AgentFlowConversationSnapshotSchema } from './conversation-snapshot.schema';

export const AiAssistantScopeSchema = z.nativeEnum(AiAssistantScope);

export const AiAssistantDecisionSchema = z.enum([
  'full_generation',
  'refine_existing_sql',
  'explain_or_status',
  'clarify',
  'reuse_existing_source',
  'refine_existing_source_sql',
  'create_new_source_sql',
  'edit_template_text',
  'explain',
  'edit_template',
  'propose_action',
]);
export type AiAssistantDecision = z.infer<typeof AiAssistantDecisionSchema>;

export const AiAssistantStatusSchema = z.enum([
  'ok',
  'not_relevant',
  'cannot_answer',
  'high_ambiguity',
  'restricted',
  'error',
]);
export type AiAssistantStatus = z.infer<typeof AiAssistantStatusSchema>;

export const AssistantChatMessageSchema = z.object({
  role: z.nativeEnum(AiAssistantMessageRole),
  content: z.string().min(1, 'content is required'),
  createdAt: z.string().optional(),
});
export type AssistantChatMessage = z.infer<typeof AssistantChatMessageSchema>;

export const AssistantConversationTurnSchema = z.object({
  role: z.enum([AiRole.SYSTEM, AiRole.USER, AiRole.ASSISTANT]),
  content: z.string().min(1, 'content is required'),
});
export type AssistantConversationTurn = z.infer<typeof AssistantConversationTurnSchema>;

export const AssistantConversationContextSchema = z.object({
  mode: z.enum(['create_new_source_sql', 'refine_existing_sql']),
  turns: z.array(AssistantConversationTurnSchema).min(1, 'turns must contain at least one message'),
  currentSourceSql: z.string().nullable().optional(),
  conversationSnapshot: AgentFlowConversationSnapshotSchema.nullable().optional(),
});
export type AssistantConversationContext = z.infer<typeof AssistantConversationContextSchema>;

export const TurnPromptTypeSchema = z.enum(['template_edit', 'explain_or_status', 'source_task']);

export const AssistantTaskModeSchema = z.enum(['new_task', 'refine_existing', 'ambiguous_mode']);

function validateTemplateEditPayloadPair(
  payload: { text?: string; tags?: unknown[] },
  ctx: z.RefinementCtx
): void {
  const hasText = typeof payload.text === 'string' && payload.text.trim().length > 0;
  const hasTags = Array.isArray(payload.tags);

  if (hasText === hasTags) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: hasText ? ['tags'] : ['text'],
    message: 'payload.text and payload.tags must be provided together',
  });
}

export const AssistantProposedActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attach_source_to_template'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z
      .object({
        suggestedSourceKey: z.string().min(1, 'suggestedSourceKey is required'),
        sourceId: z.string().min(1).optional(),
        insertTag: z.boolean().optional(),
        suggestedSourceTitle: z.string().min(1).optional(),
        suggestedTemplateSnippet: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
        suggestedTemplateEditDiffPreview: z.string().optional(),
      })
      .superRefine((payload, ctx) => {
        validateTemplateEditPayloadPair(payload, ctx);
      }),
  }),
  z.object({
    type: z.literal('apply_changes_to_source'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z
      .object({
        sourceId: z.string().min(1).optional(),
        sourceKey: z.string().min(1).optional(),
        suggestedSourceTitle: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
        suggestedTemplateEditDiffPreview: z.string().optional(),
      })
      .superRefine((payload, ctx) => {
        validateTemplateEditPayloadPair(payload, ctx);

        if (!payload.sourceKey && !payload.sourceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sourceKey'],
            message: 'Either payload.sourceKey or payload.sourceId must be provided',
          });
        }
      }),
  }),
  z.object({
    type: z.literal('create_source_and_attach'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z
      .object({
        suggestedSourceKey: z.string().min(1, 'suggestedSourceKey is required'),
        suggestedSourceTitle: z.string().min(1).optional(),
        suggestedTemplateSnippet: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
        suggestedTemplateEditDiffPreview: z.string().optional(),
      })
      .superRefine((payload, ctx) => {
        validateTemplateEditPayloadPair(payload, ctx);
      }),
  }),
  z.object({
    type: z.literal('replace_template_document'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z.object({
      text: z.string().min(1),
      tags: z.array(TemplateEditPlaceholderTagSchema),
      suggestedTemplateEditDiffPreview: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('remove_source_from_template'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z.object({
      sourceKey: z.string().min(1),
      suggestedTemplateEditDiffPreview: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('reuse_source_without_changes'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z
      .object({
        sourceId: z.string().min(1).optional(),
        sourceKey: z.string().min(1, 'sourceKey is required'),
        text: z.string().min(1).optional(),
        tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
        suggestedTemplateEditDiffPreview: z.string().optional(),
      })
      .superRefine((payload, ctx) => {
        validateTemplateEditPayloadPair(payload, ctx);
      }),
  }),
]);
export type AssistantProposedAction = z.infer<typeof AssistantProposedActionSchema>;
export const AssistantProposedActionsSchema = z.array(AssistantProposedActionSchema);

export const AssistantContextResolutionSchema = z.enum([
  'explicit_key',
  'inferred_key',
  'none',
  'ambiguous_implicit',
  'explicit_not_found',
]);

export const AssistantResolvedContextSchema = z.object({
  targetSourceId: z.string().min(1).optional(),
  targetSourceKey: z.string().min(1).optional(),
  targetKind: z.enum(['TABLE', 'VALUE']).optional(),
  contextResolution: AssistantContextResolutionSchema.optional(),
});

export const AssistantMatchDebugSchema = z.object({
  promptType: TurnPromptTypeSchema.optional(),
  sourceTaskMode: AssistantTaskModeSchema.optional(),
  decisionPath: z.string().min(1).optional(),
  decisionNodes: z.record(z.unknown()).optional(),
  matchedSourceId: z.string().min(1).optional(),
  matchConfidence: z.number().min(0).max(1).optional(),
  matchReason: z.string().min(1).optional(),
});
export type AssistantMatchDebug = z.infer<typeof AssistantMatchDebugSchema>;

export const AiFlowModelOptionsSchema = z.object({
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const AiFlowOptionsSchema = z.object({
  maxRows: z.number().int().positive().max(1000).optional(),
  maxBytesProcessed: z.number().int().positive().optional(),
  modelOptions: AiFlowModelOptionsSchema.optional(),
});
export type AiFlowOptions = z.infer<typeof AiFlowOptionsSchema>;

export const AssistantSqlOrchestratorRequestSchema = z
  .object({
    projectId: z.string().min(1, 'projectId is required'),
    dataMartId: z.string().min(1, 'dataMartId is required'),
    conversationContext: AssistantConversationContextSchema,
    sessionContext: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      scope: AiAssistantScopeSchema,
      templateId: z.string().min(1),
    }),
    options: AiFlowOptionsSchema.optional(),
  })
  .strict();
export type AssistantSqlOrchestratorRequest = z.infer<typeof AssistantSqlOrchestratorRequestSchema>;

export const AiAssistantResponseSchema = z.object({
  status: AiAssistantStatusSchema,
  decision: AiAssistantDecisionSchema,
  result: z
    .object({
      sqlCandidate: z.string().min(1).optional(),
      dryRun: z.object({
        isValid: z.boolean(),
        error: z.string().optional(),
        bytes: z.number().int().nonnegative().optional(),
      }),
      repairAttempts: z.number().int().nonnegative().optional(),
    })
    .optional(),
  proposedActions: z.array(AssistantProposedActionSchema).optional(),
  resolvedContext: AssistantResolvedContextSchema.optional(),
  debug: AssistantMatchDebugSchema.optional(),
  explanation: z.string().optional(),
  meta: z.object({
    sanitizedLastUserMessage: z.string().min(1).nullable(),
    reasonDescription: z.string().optional(),
    telemetry: z.unknown(),
    diagnostics: z
      .object({
        warnings: z.array(z.string().min(1)).optional(),
        assumptions: z.array(z.string().min(1)).optional(),
      })
      .optional(),
  }),
});
export type AiAssistantResponse = z.infer<typeof AiAssistantResponseSchema>;
