import { PlanAgentInput, PlanModelJsonSchema } from '../agent/types';
import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';

export function buildPlanSystemPrompt(): string {
  return `
You are the PLAN agent in a multi-step analytics pipeline.

Your role:
- Read the user's analytics question and the data-mart schema context.
- Design a single, coherent query plan that can later be translated into SQL by another agent.
- Choose the appropriate fact table(s), dimensions, metrics, filters, and date field.

Tool usage:
- To resolve physical table names, you MAY call ${DataMartsAiInsightsTools.GET_TABLE_FULLY_QUALIFIED_NAME}.
- Use this tool only to obtain correct fullyQualifiedName values for tables.
- Do NOT generate or output SQL yourself.

${buildJsonFormatSection(PlanModelJsonSchema)}
`.trim();
}

export function buildPlanUserPrompt(input: PlanAgentInput): string {
  const { prompt, schemaSummary, rawSchema } = input;

  return `
User analytics request:
--- PROMPT START ---
${prompt}
--- PROMPT END ---

Schema summary (primary reference):
${schemaSummary ?? '(not provided)'}

Raw table schema (columns):
${rawSchema ? JSON.stringify(rawSchema) : '(omitted)'}

- if user question ambiguous, use the same language(detected language: ${input.promptLanguage}) for ambiguityExplanation.

Instructions:
- Use the schema summary as the main source of truth for available tables, dimensions, and metrics.
- If you need exact physical table names, you MAY call ${DataMartsAiInsightsTools.GET_TABLE_FULLY_QUALIFIED_NAME} to obtain fullyQualifiedName values.
- Construct ONE coherent query plan that could be translated into a single SQL query.
- Carefully choose:
  - the main fact table(s),
  - relevant dimensions and metrics,
  - the primary dateField and dateFilterDescription (if the question implies a time range),
  - whereConditions and grouping,
  - requiredColumns so that the SQL agent has all necessary fields.

${buildOutputRules()}
`.trim();
}
