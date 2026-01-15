import { z } from 'zod';
import { GetMetadataOutput, QueryRow, SqlStepError } from '../ai-insights-types';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export function isFinalReasonAnswer(value: FinalReason) {
  return value === FinalReason.ANSWER;
}

export enum FinalReason {
  ANSWER = 'answer',
  NO_DATA = 'no_data',
  NOT_RELEVANT = 'not_relevant',
  CANNOT_ANSWER = 'cannot_answer',
  HIGH_AMBIGUITY = 'high_ambiguity',
  SQL_ERROR = 'sql_error',
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

export const ColumnPreNormalizeSchema = z.object({
  kind: z
    .enum(['strip_prefix', 'strip_suffix', 'regex_replace'])
    .describe(
      'Declarative pre-normalization applied BEFORE parsing/casting. ' +
        'Must be implemented via deterministic string or regex replacement (NOT TRIM).'
    ),

  value: z
    .string()
    .optional()
    .describe('For strip_prefix / strip_suffix: exact string value to remove.'),

  pattern: z
    .string()
    .optional()
    .describe('For regex_replace: regex pattern (storageType-agnostic, no SQL).'),

  replacement: z.string().optional().describe('For regex_replace: replacement string.'),

  note: z
    .string()
    .optional()
    .describe('Short explanation and example of what is removed or changed.'),
});

export const ColumnTransformSchema = z.object({
  kind: z.enum(['none', 'cast', 'parse_date', 'parse_timestamp']).optional(),
  format: z
    .string()
    .optional()
    .describe(
      [
        'Optional. StorageType-native parsing format for parse_date / parse_timestamp.',
        'MUST use native format tokens for the target storage engine (e.g., Snowflake format model, not Java/strftime).',
        'The format MUST be compatible with real column values and schema examples.',
        'If real values contain fixed literal text (e.g., "GMT", "UTC", "T", "Z"), it MUST be either:',
        '- included in the format as a quoted literal, OR',
        '- removed deterministically via preNormalize steps.',
        'Do NOT rely on TRY/SAFE parsing semantics.',
      ].join('\n')
    ),
  targetType: z
    .enum(['string', 'float', 'integer', 'boolean', 'number'])
    .optional()
    .describe(
      'Optional. Desired logical result type for cast. ' +
        'Used to control numeric precision (e.g. use "float" to preserve decimals and avoid integer truncation).'
    ),
  preNormalize: z
    .array(ColumnPreNormalizeSchema)
    .optional()
    .describe('Optional declarative steps to normalize string input before parsing'),
});

export const RequiredColumnMetaSchema = z.object({
  rawType: z
    .string()
    .optional()
    .describe('Column type from rawSchema (e.g. string/varchar/date/timestamp/number).'),
  semanticType: z
    .enum(['string', 'number', 'boolean', 'date', 'datetime', 'timestamp'])
    .optional()
    .describe('How the column is used logically in the plan.'),
  resolvedIdentifier: z
    .string()
    .optional()
    .describe(
      'Exact column identifier to use in SQL for this storageType (already quoted if required).'
    ),
  transform: ColumnTransformSchema.optional().describe('Abstract transformation hint (NO SQL).'),
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

  requiredColumnsMeta: z
    .record(z.string(), RequiredColumnMetaSchema)
    .optional()
    .describe(
      'Optional column-level hints derived from rawSchema and storageType. ' +
        'Used by the SQL agent to apply correct column quoting and explicit type conversions. ' +
        'Must not contain SQL.'
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
  rawSchema?: GetMetadataOutput;
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
  rawSchema?: GetMetadataOutput;
}

export function isSqlExecutionErrorStatus(status: SqlExecutionStatus) {
  return status === SqlExecutionStatus.SQL_ERROR;
}

export enum SqlExecutionStatus {
  OK = 'ok',
  NO_DATA = 'no_data',
  SQL_ERROR = 'sql_error',
}

export type SqlAgentResult = {
  status: SqlExecutionStatus;
  sql: string;
  dryRunBytes?: number;
  rows: QueryRow[] | null;

  sqlError?: string | null;
  sqlErrorSuggestion?: string | null;
};

export interface FinalizeAgentInput {
  prompt: string;
  promptLanguage: string;
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

// Insight Generation Agent Types
export interface InsightGenerationAgentInput {
  dataMartTitle: string | null;
  dataMartDescription: string | null;
  schema: DataMartSchema;
}

export const InsightGenerationAgentResponseSchema = z.object({
  title: z
    .string()
    .min(1, 'title is required')
    .describe(
      'A concise, engaging title for the insight that describes what kind of analysis or questions it can answer. ' +
        'The title should be clear and actionable, typically 3-8 words.'
    ),
  template: z
    .string()
    .min(1, 'template is required')
    .describe(
      [
        'A beautiful Markdown template for the insight.',
        'Requirements:',
        '- Must include 2-3 {{#prompt}}...{{/prompt}} blocks with interesting AI queries about the data mart.',
        '- Each prompt block should contain a specific, valuable question that users would want to ask about their data.',
        '- The prompts should be diverse and cover different aspects of the data (trends, comparisons, insights, anomalies, etc.).',
        '- Use proper Markdown formatting: headers, lists, emphasis where appropriate.',
        '- Make it visually appealing and easy to read.',
        '- The template should provide structure for exploring the data mart in meaningful ways.',
      ].join('\n')
    ),
});

export type InsightGenerationAgentResponse = z.infer<typeof InsightGenerationAgentResponseSchema>;

export type SqlErrorAdvisorInput = {
  prompt: string;
  sql: string;
  sqlStepError: SqlStepError;
  queryPlan: QueryPlan;
  schema?: GetMetadataOutput;
};

export const SqlErrorAdvisorResponseSchema = z.object({
  sqlError: z
    .string()
    .min(1)
    .describe(
      'Required. A short, user-facing summary of what went wrong (based on the error message).'
    ),
  sqlErrorSuggestion: z
    .string()
    .min(1)
    .describe(
      'Required. Concrete suggestions to resolve the error. Include either SQL-side fix ideas and/or data issue explanation. Must be actionable.'
    ),
});

export type SqlErrorAdvisorResponse = z.infer<typeof SqlErrorAdvisorResponseSchema>;

export const SqlBuilderResponseSchema = z.object({
  sql: z
    .string()
    .min(1, 'SQL is required')
    .describe(
      'Single final SQL statement that answers the question per the provided plan and schema.'
    ),
  notes: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Optional short English note for internal debugging (not user-facing). No SQL instructions here.'
    ),
});

export type SqlBuilderResponse = z.infer<typeof SqlBuilderResponseSchema>;

export type QueryRepairAttempt = {
  sql: string;
  error: SqlStepError;
};

export type QueryRepairInput = {
  prompt: string;
  queryPlan: QueryPlan;
  schema?: GetMetadataOutput;

  attempts: QueryRepairAttempt[];
};

export enum QueryRepairAction {
  RETRY_SQL = 'retry_sql',
  CANNOT_REPAIR = 'cannot_repair',
}

export const QueryRepairResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal(QueryRepairAction.RETRY_SQL).describe('when can safely fix the SQL'),
    sql: z
      .string()
      .min(1)
      .describe(
        'Required. Repaired SQL query (single SELECT/WITH). Must differ from the CURRENT attempt.'
      ),
    notes: z
      .string()
      .optional()
      .describe('Optional. Short internal notes for telemetry/debugging.'),
  }),
  z.object({
    action: z
      .literal(QueryRepairAction.CANNOT_REPAIR)
      .describe('when safe repair is not possible from available metadata'),
    notes: z
      .string()
      .min(1)
      .describe(
        'Required. Why repair is not safely possible (e.g., unknown date format requires date arithmetic).'
      ),
  }),
]);

export type QueryRepairResponse = z.infer<typeof QueryRepairResponseSchema>;
