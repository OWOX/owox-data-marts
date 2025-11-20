import { AgentBudgets, AgentTelemetry, AiContext } from '../../common/ai-insights/agent/types';
import { z } from 'zod';
import { DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';

export const AI_INSIGHTS_FACADE = Symbol('AI_INSIGHTS_FACADE');

export interface DataMartInsightsContext extends AiContext {
  projectId: string;
  dataMartId: string;
  // Optional telemetry object to record LLM and tool calls.
  telemetry?: AgentTelemetry;
  // Optional runtime budgets that tools may respect during execution.
  budgets?: AgentBudgets;
}

export const OptionsSchema = z.object({
  dryRun: z.boolean().default(false),
  maxRows: z.number().int().positive().max(1000).default(30),
  maxBytesProcessed: z.number().int().positive().optional(),
});
export type Options = z.infer<typeof OptionsSchema>;

export const AnswerPromptRequestSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  dataMartId: z.string().min(1, 'dataMartId is required'),
  prompt: z.string().min(1, 'prompt is required'),
  options: OptionsSchema.optional(),
});
export type AnswerPromptRequest = z.infer<typeof AnswerPromptRequestSchema>;

export const AnswerPromptResponseSchema = z.object({
  promptAnswer: z.string().min(1),
  meta: z.object({
    prompt: z.string().min(1),
    artifact: z.string().min(1),
    telemetry: z.unknown().optional(),
  }),
});
export type AnswerPromptResponse = z.infer<typeof AnswerPromptResponseSchema>;

export const QueryRowSchema = z.record(z.string(), z.unknown());
export type QueryRow = z.infer<typeof QueryRowSchema>;

export const FinalizeInsightInputSchema = z.object({
  prompt: z.string().min(1),
  promptAnswer: z.string().min(1),
  artifact: z.string().min(1),
});
export type FinalizeInsightInput = z.infer<typeof FinalizeInsightInputSchema>;
export const FinalizeInsightOutputSchema = z.object({
  promptAnswer: z.string().min(1),
  meta: z.object({
    prompt: z.string().min(1),
    artifact: z.string().min(1),
    telemetry: z.unknown().optional(),
  }),
});

export type FinalizeInsightOutput = z.infer<typeof FinalizeInsightOutputSchema>;

export const GetMetadataInputSchema = z.object({});
export type GetMetadataInput = z.infer<typeof GetMetadataInputSchema>;

export const GetMetadataOutputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  storageType: z.string().optional(),
  schema: DataMartSchemaSchema.optional(),
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
