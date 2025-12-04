import { AgentBudgets, AgentTelemetry, AiContext } from '../../common/ai-insights/agent/types';
import { z } from 'zod';
import { DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
import { AiChatProvider } from '../../common/ai-insights/agent/ai-core';
import { ToolRegistry } from '../../common/ai-insights/agent/tool-registry';
import { PromptAnswer } from './data-mart-insights.types';

export const AI_INSIGHTS_FACADE = Symbol('AI_INSIGHTS_FACADE');

export interface DataMartInsightsContext extends AiContext {
  projectId: string;
  dataMartId: string;
  prompt: string;
  telemetry?: AgentTelemetry;
  budgets?: AgentBudgets;
}

export const modelOptionsSchema = z.object({
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const OptionsSchema = z.object({
  maxRows: z.number().int().positive().max(1000).optional(),
  maxBytesProcessed: z.number().int().positive().optional(),
  modelOptions: modelOptionsSchema.optional(),
});
export type Options = z.infer<typeof OptionsSchema>;

export const AnswerPromptRequestSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  dataMartId: z.string().min(1, 'dataMartId is required'),
  prompt: z.string().min(1, 'prompt is required'),
  wholeTemplate: z.string().optional(),
  options: OptionsSchema.optional(),
});
export type AnswerPromptRequest = z.infer<typeof AnswerPromptRequestSchema>;

export const AnswerPromptResponseSchema = z.object({
  promptAnswer: z.string().min(1).optional(),
  status: z.nativeEnum(PromptAnswer),
  meta: z.object({
    prompt: z.string().min(1),
    artifact: z.string().optional(),
    reasonDescription: z.string().optional(),
    telemetry: z.unknown(),
  }),
});
export type AnswerPromptResponse = z.infer<typeof AnswerPromptResponseSchema>;

export const QueryRowSchema = z.record(z.string(), z.unknown());
export type QueryRow = z.infer<typeof QueryRowSchema>;

export const GetMetadataInputSchema = z.object({});
export type GetMetadataInput = z.infer<typeof GetMetadataInputSchema>;

export const GetMetadataOutputSchema = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  storageType: z.string(),
  schema: DataMartSchemaSchema,
});
export type GetMetadataOutput = z.infer<typeof GetMetadataOutputSchema>;

export const SqlDryRunInputSchema = z.object({
  sql: z.string().min(1),
});
export type SqlDryRunInput = z.infer<typeof SqlDryRunInputSchema>;

export const SqlDryRunOutputSchema = z.object({
  isValid: z.boolean(),
  error: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
});
export type SqlDryRunOutput = z.infer<typeof SqlDryRunOutputSchema>;

export const SqlExecuteInputSchema = z.object({
  sql: z.string().min(1),
  maxRows: z.number().int().positive().max(1000).default(30),
});
export type SqlExecuteInput = z.infer<typeof SqlExecuteInputSchema>;

export const SqlExecuteOutputSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())) as unknown as z.ZodType<QueryRow[]>,
});
export type SqlExecuteOutput = z.infer<typeof SqlExecuteOutputSchema>;

export const GetFullyQualifiedTableNameInputSchema = z.object({});
export type GetFullyQualifiedTableNameInput = z.infer<typeof GetFullyQualifiedTableNameInputSchema>;

export const FullyQualifiedTableNameOutputSchema = z.object({
  fullyQualifiedName: z.string().min(1),
});
export type FullyQualifiedTableNameOutput = z.infer<typeof FullyQualifiedTableNameOutputSchema>;

export interface Agent<Input, Output> {
  readonly name: string;
  run(input: Input, shared: SharedAgentContext): Promise<Output>;
}

export interface SharedAgentContext {
  aiProvider: AiChatProvider;
  toolRegistry: ToolRegistry;
  budgets: AgentBudgets;
  telemetry: AgentTelemetry;
  projectId: string;
  dataMartId: string;
}
