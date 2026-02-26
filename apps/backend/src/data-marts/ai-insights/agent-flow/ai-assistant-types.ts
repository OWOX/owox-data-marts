import { z } from 'zod';
import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { TemplateEditPlaceholderTagSchema } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags.contracts';

export const AssistantOrchestratorScopeSchema = z.nativeEnum(AiAssistantScope);

export const AssistantOrchestratorDecisionSchema = z.enum([
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
export type AssistantOrchestratorDecision = z.infer<typeof AssistantOrchestratorDecisionSchema>;

export const AssistantOrchestratorStatusSchema = z.enum([
  'ok',
  'not_relevant',
  'cannot_answer',
  'high_ambiguity',
  'restricted',
  'error',
]);
export type AssistantOrchestratorStatus = z.infer<typeof AssistantOrchestratorStatusSchema>;

export const AssistantChatMessageSchema = z.object({
  role: z.nativeEnum(AiAssistantMessageRole),
  content: z.string().min(1, 'content is required'),
  createdAt: z.string().optional(),
});
export type AssistantChatMessage = z.infer<typeof AssistantChatMessageSchema>;

export const TurnPromptTypeSchema = z.enum(['template_edit', 'explain_or_status', 'source_task']);

export const AssistantTaskModeSchema = z.enum(['new_task', 'refine_existing', 'ambiguous_mode']);

export const AssistantProposedActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attach_source_to_template'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z.object({
      suggestedSourceKey: z.string().min(1, 'suggestedSourceKey is required'),
      targetArtifactId: z.string().min(1).optional(),
      insertTag: z.boolean().optional(),
      suggestedArtifactTitle: z.string().min(1).optional(),
      suggestedTemplateSnippet: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
      suggestedTemplateEditDiffPreview: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('apply_sql_to_artifact'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z.object({
      artifactId: z.string().min(1).optional(),
      suggestedArtifactTitle: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
      suggestedTemplateEditDiffPreview: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('apply_changes_to_source'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z.object({
      sourceId: z.string().min(1).optional(),
      sourceKey: z.string().min(1).optional(),
      artifactId: z.string().min(1).optional(),
      suggestedArtifactTitle: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
      suggestedTemplateEditDiffPreview: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('create_source_and_attach'),
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    payload: z.object({
      suggestedSourceKey: z.string().min(1).optional(),
      suggestedArtifactTitle: z.string().min(1).optional(),
      suggestedTemplateSnippet: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
      suggestedTemplateEditDiffPreview: z.string().optional(),
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
    payload: z.object({
      sourceId: z.string().min(1).optional(),
      sourceKey: z.string().min(1).optional(),
      artifactId: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      tags: z.array(TemplateEditPlaceholderTagSchema).optional(),
      suggestedTemplateEditDiffPreview: z.string().optional(),
    }),
  }),
]);
export type AssistantProposedAction = z.infer<typeof AssistantProposedActionSchema>;

export const AssistantContextResolutionSchema = z.enum([
  'explicit_key',
  'inferred_key',
  'inferred_unlinked_artifact',
  'none',
  'ambiguous_implicit',
  'explicit_not_found',
]);

export const AssistantResolvedContextSchema = z.object({
  targetSourceKey: z.string().min(1).optional(),
  targetArtifactId: z.string().min(1).optional(),
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

export const AssistantOrchestratorRequestSchema = z
  .object({
    projectId: z.string().min(1, 'projectId is required'),
    dataMartId: z.string().min(1, 'dataMartId is required'),
    history: z
      .array(AssistantChatMessageSchema)
      .min(1, 'history must contain at least one message'),
    sessionContext: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      scope: AssistantOrchestratorScopeSchema,
      templateId: z.string().min(1),
      currentArtifactSql: z.string().optional(),
    }),
    options: AiFlowOptionsSchema.optional(),
  })
  .superRefine((request, ctx) => {
    const hasUserMessage = request.history.some(message => message.role === 'user');
    if (!hasUserMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['history'],
        message: 'history must contain at least one user message',
      });
    }
  });
export type AssistantOrchestratorRequest = z.infer<typeof AssistantOrchestratorRequestSchema>;

export const AssistantOrchestratorResponseSchema = z.object({
  status: AssistantOrchestratorStatusSchema,
  decision: AssistantOrchestratorDecisionSchema,
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
export type AssistantOrchestratorResponse = z.infer<typeof AssistantOrchestratorResponseSchema>;
