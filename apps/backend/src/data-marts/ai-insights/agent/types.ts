import { z } from 'zod';
import { GetMetadataOutput } from '../ai-insights-types';

export function isFinalReasonAnswer(value: FinalReason) {
  return value === FinalReason.ANSWER;
}

export enum FinalReason {
  ANSWER = 'answer',
  NO_DATA = 'no_data',
  NOT_RELEVANT = 'not_relevant',
  CANNOT_ANSWER = 'cannot_answer',
  HIGH_AMBIGUITY = 'high_ambiguity',
}

export enum TriageOutcome {
  NOT_RELEVANT = 'not_relevant',
  CANNOT_ANSWER = 'cannot_answer',
  OK = 'ok',
}

export function isTriageOutcomeNotOk(value: TriageOutcome): boolean {
  return value !== TriageOutcome.OK;
}

export interface FinalizeResult {
  status: FinalReason;
  reasonDescription?: string;
  promptAnswer?: string;
  artifact?: string;
}

export interface TriageResult {
  outcome: TriageOutcome;
  promptLanguage: string;
  reasonText?: string;
  rawSchema?: GetMetadataOutput;
  schemaSummary?: string;
}

export const TriageModelJsonSchema = z.object({
  outcome: z
    .nativeEnum(TriageOutcome)
    .describe(
      [
        'Required. The triage decision for the query.',
        'Must be one of:',
        '- "not_relevant": the question is not a data/analytics question about this data-mart.',
        '- "cannot_answer": the question is analytics-related, but this data-mart clearly does not contain the data needed to answer it (wrong dataset, missing entities/fields, wrong time coverage, etc.).',
        '- "ok": the question is analytics-related and can be answered using this data-mart.',
      ].join('\n')
    ),
  promptLanguage: z
    .string()
    .describe(
      'Required. The language of the user’s original prompt. For example: "en", "es", "fr", "de".'
    ),
  reasonText: z
    .string()
    .nullable()
    .optional()
    .describe(
      [
        'Short explanation for the triage decision in the SAME language as the user question(prompt).',
        '- Required (non-empty) when outcome is "not_relevant" or "cannot_answer".',
        '- For outcome "ok" it may be omitted or set to null.',
      ].join('\n')
    ),

  schemaSummary: z
    .string()
    .nullable()
    .optional()
    .describe(
      [
        'Short schema summary in English, required only when outcome = "ok".',
        'Describe in 1–3 paragraphs or bullet points:',
        '- main tables/views relevant to the question,',
        '- important dimensions and metrics,',
        '- primary date fields and their meaning.',
        'For "not_relevant" and "cannot_answer" this field may be omitted or set to null.',
      ].join('\n')
    ),
});

export const QueryPlanTableSchema = z.object({
  fullyQualifiedName: z
    .string()
    .min(1, 'fullyQualifiedName must be non-empty')
    .describe(
      'Required. Fully qualified physical table or view name in the warehouse. ' +
        'This value is usually obtained via the GET_TABLE_FULLY_QUALIFIED_NAME tool.'
    ),
  role: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Optional logical role of the table in the plan, e.g. "fact", "dimension", "bridge", "lookup". ' +
        'May be null or omitted if the role is not important.'
    ),
});

export const QueryPlanSchema = z.object({
  tables: z
    .array(QueryPlanTableSchema)
    .default([])
    .describe(
      'List of all tables/views that will participate in the query. ' +
        'Include at least one primary fact table and any necessary dimensions/lookup tables.'
    ),

  dimensions: z
    .array(z.string())
    .default([])
    .describe(
      'Columns used as dimensions/grouping keys (for GROUP BY or breakdown). ' +
        'These are typically categorical fields like campaign, channel, country, etc.'
    ),

  metrics: z
    .array(z.string())
    .default([])
    .describe(
      'Columns that will be aggregated in the query (SUM, COUNT, AVG, etc.). ' +
        'For example: impressions, clicks, spend, revenue.'
    ),

  dateField: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Primary date/datetime column used for time filtering and grouping when the question has a time aspect. ' +
        'If the question does not involve time, this may be null or omitted.'
    ),

  dateFilterDescription: z
    .string()
    .nullable()
    .optional()
    .describe(
      'High-level natural language description of the date filter implied by the question, ' +
        'e.g. "last 30 days", "current month", "from 2024-01-01 to 2024-03-31". ' +
        'This is NOT SQL and will be interpreted downstream.'
    ),

  whereConditions: z
    .array(z.string())
    .default([])
    .describe(
      'High-level textual filters that should be applied to the data, for example: ' +
        '"campaign_status = active", "country = US". ' +
        'These are NOT raw SQL fragments, but human-readable descriptions.'
    ),

  grouping: z
    .array(z.string())
    .default([])
    .describe(
      'Final set of grouping columns. Usually the same as dimensions, ' +
        'but can differ if some dimensions are not used directly in GROUP BY.'
    ),

  /**
   * Minimal set of column names that must be available in the SQL query.
   * Typically: dimensions + metrics + dateField (if present).
   */
  requiredColumns: z
    .array(z.string())
    .default([])
    .describe(
      [
        'Minimal complete set of column names that the SQL agent is allowed to use.',
        'At minimum it MUST include:',
        '- all "dimensions",',
        '- all "metrics",',
        '- "dateField" (if not null),',
        '- any additional columns referenced in whereConditions, grouping (if different from dimensions),',
        '- any columns implied by ordering/ranking logic in the question.',
        'The SQL agent will rely ONLY on "requiredColumns" when selecting fields from the schema.',
        'If you are unsure whether a column might be needed, you SHOULD include it in requiredColumns.',
      ].join('\n')
    ),

  notes: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Optional free-form notes about the plan: join logic hints, caveats, ' +
        'assumptions, or any additional guidance for the SQL agent.'
    ),
});

export const PlanModelJsonSchema = z.object({
  plan: QueryPlanSchema.describe(
    'The query plan that describes which tables, fields, filters and groupings ' +
      'should be used to answer the user question. This plan will be consumed by a SQL agent.'
  ),
  maybeAmbiguous: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Set to true if the question or plan is ambiguous and might require user clarification ' +
        '(for example, unclear metric definition, multiple possible date fields, etc.).'
    ),
  ambiguityExplanation: z
    .string()
    .nullable()
    .optional()
    .describe(
      'If maybeAmbiguous is true, explain in plain English what is ambiguous and ' +
        'which clarifications might be needed.'
    ),
});

export type QueryPlan = z.infer<typeof QueryPlanSchema>;

export interface PlanAgentInput {
  prompt: string;
  promptLanguage: string;
  schemaSummary?: string;
  rawSchema?: unknown;
}

export interface PlanAgentResult {
  plan: QueryPlan;
  maybeAmbiguous?: boolean;
  ambiguityExplanation?: string;
}

export interface SqlAgentInput {
  prompt: string;
  plan: QueryPlan;
  schemaSummary?: string;
  rawSchema?: unknown;
}

export enum SqlExecutionStatus {
  OK = 'ok',
  NO_DATA = 'no_data',
  SQL_ERROR = 'sql_error',
}

export interface SqlAgentResult {
  status: SqlExecutionStatus;
  sql: string;
  dryRunBytes?: number | null;
  rows?: Array<Record<string, unknown>> | null;
}

export const SqlAgentResponseSchema = z.object({
  status: z
    .nativeEnum(SqlExecutionStatus)
    .describe(
      [
        'Execution status of the SQL pipeline.',
        '- "ok": SQL executed successfully and returned one or more rows.',
        '- "no_data": SQL executed successfully but returned zero rows.',
        '- "sql_error": SQL could not be validated or executed after the allowed number of attempts.',
      ].join('\n')
    ),

  sql: z
    .string()
    .min(1, 'SQL required')
    .describe(
      'Final SQL query string that was validated and executed (or last attempted SQL when status = "sql_error").'
    ),

  errorMessage: z
    .string()
    .nullable()
    .optional()
    .describe(
      [
        'Short English description of the main problem when status = "sql_error".',
        'For "ok" and "no_data" this MUST be null or omitted.',
      ].join('\n')
    ),
});

export interface FinalizeAgentInput {
  prompt: string;
  wholeTemplate?: string;
  sqlAgentResult: SqlAgentResult;
}

export const FinalizeAgentResponseSchema = z.object({
  reason: z
    .nativeEnum(FinalReason)
    .describe(
      [
        'Reason code describing how the final Markdown answer was produced.',
        'For THIS agent, you MUST use only:',
        '- "answer": there was data in rows and you produced a meaningful analytical answer from it.',
        '- "no_data": there were no rows or the upstream SQL execution did not return usable data.',
        '',
        'Other enum values ("not_relevant", "cannot_answer", "high_ambiguity") are reserved for',
        'other components in the pipeline and MUST NOT be used by this agent.',
      ].join('\n')
    ),

  promptAnswer: z
    .string()
    .min(1, 'promptAnswer must be non-empty')
    .describe(
      [
        'Final user-facing Markdown fragment.',
        '- It MUST contain only the analytical answer body (compatible with the optional template if provided).',
        '- It MUST NOT include any JSON, system explanations, or technical details.',
        '- It MUST NOT restate or duplicate the template text itself.',
      ].join('\n')
    ),
});

export type FinalizeAgentResponse = z.infer<typeof FinalizeAgentResponseSchema>;
