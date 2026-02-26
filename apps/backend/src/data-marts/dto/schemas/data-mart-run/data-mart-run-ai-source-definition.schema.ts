import { z } from 'zod';
import { AssistantOrchestratorScopeSchema } from '../../../ai-insights/agent-flow/ai-assistant-types';

export const DataMartRunAiSourceDefinitionSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required'),
  scope: AssistantOrchestratorScopeSchema,
  templateId: z.string().trim().min(1).nullable().optional(),
  turnId: z.string().trim().min(1).nullable().optional(),
});

export type DataMartRunAiSourceDefinition = z.infer<typeof DataMartRunAiSourceDefinitionSchema>;
