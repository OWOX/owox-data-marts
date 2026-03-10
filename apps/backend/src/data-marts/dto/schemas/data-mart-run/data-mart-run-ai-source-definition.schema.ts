import { z } from 'zod';
import { AiAssistantScopeSchema } from '../../../ai-insights/agent-flow/ai-assistant-types';

export const DataMartRunAiSourceDefinitionSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required'),
  scope: AiAssistantScopeSchema,
  templateId: z.string().trim().min(1).nullable().optional(),
  turnId: z.string().trim().min(1).nullable().optional(),
});

export type DataMartRunAiSourceDefinition = z.infer<typeof DataMartRunAiSourceDefinitionSchema>;
