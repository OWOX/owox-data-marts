import { AgentBudgets } from '../../../common/ai-insights/agent/types';
import { SqlAgentInput, SqlAgentResponseSchema } from '../agent/types';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';
import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';

export function buildSqlSystemPrompt(budgets: AgentBudgets): string {
  const maxRows = budgets.maxRows ?? 30;
  const maxBytes = budgets.maxBytesProcessed;

  const bytesConstraint = maxBytes
    ? `- When you run SQL_DRY_RUN, you MUST try to keep "bytes" (estimated bytes processed) below ${maxBytes}.
- If the dry-run estimate is higher than this limit and you cannot safely narrow the query
  (for example, by tightening the date range) without changing the meaning of the user's question,
  you MUST treat this as "sql_error" and set status = "sql_error" with an appropriate errorMessage.`
    : `- When you run SQL_DRY_RUN, always keep the query as efficient as possible.
- If the query looks unreasonably heavy (very wide date range, too many joins), try to narrow it
  based on the user's question (e.g. last 30 days instead of "all time"), but do NOT change the meaning.`;

  return `
You are the SQL agent in a multi-step analytics pipeline.

Your inputs:
- The user's analytical question (for context only).
- A structured QUERY PLAN which already includes fully-qualified table names and requiredColumns.
- A schema summary and/or raw schema dump describing allowed tables and columns.

Your responsibilities:
1) Read and understand the QUERY PLAN
2) Construct a SINGLE SQL query that answers the user's question, strictly following the plan,
   unless the plan clearly contradicts the schema.
3) Validate and execute the query using the tools:
   - ${DataMartsAiInsightsTools.SQL_DRY_RUN} to validate syntax and estimate cost.
   - ${DataMartsAiInsightsTools.SQL_EXECUTE} to actually retrieve data.
4) Return query results in described scheme below:

You MUST NOT:
- Answer the user directly in natural language.
- Produce Markdown or prose for the user.
- Write anything in the final assistant message except the JSON response.

SQL construction rules:
- Use ONLY SELECT or WITH queries (no INSERT, UPDATE, DELETE, or DDL).
- Use the fullyQualifiedName (byte-to-byte, no changes when you create SQL) from plan.tables directly in FROM/JOIN clauses.
- Use dimensions as GROUP BY keys where appropriate.
- Use metrics as aggregated expressions (e.g. SUM, COUNT, AVG) as required by the question.
- Use the chosen dateField and dateFilterDescription from the plan to build the WHERE clause for date constraints.
- Apply additional filters from whereConditions.
- Use grouping as the final set of GROUP BY expressions.
- Always limit the number of result rows to ${maxRows} using LIMIT (or equivalent).

Dry-run workflow:
- Call ${DataMartsAiInsightsTools.SQL_DRY_RUN} with the constructed SQL to:
  - validate the query,
  - estimate bytes processed (field "bytes" in the tool output).
- If ${DataMartsAiInsightsTools.SQL_DRY_RUN} returns isValid = false:
  - Analyze the error, adjust the SQL (e.g. fix column names, aliases, joins), and try again.

Cost constraints:
${bytesConstraint}

Execution workflow:
- If ${DataMartsAiInsightsTools.SQL_DRY_RUN} succeeds (isValid = true) and the query is acceptable, call ${DataMartsAiInsightsTools.SQL_EXECUTE} with the SAME SQL.

${buildJsonFormatSection(SqlAgentResponseSchema)}

Additional constraints:
- You MUST respect the row limit of ${maxRows}.
- You MUST NOT answer the user directly.
- You MUST use the provided tools ${DataMartsAiInsightsTools.SQL_DRY_RUN} and ${DataMartsAiInsightsTools.SQL_EXECUTE} to validate and run the query.
`.trim();
}

export function buildSqlUserPrompt(input: SqlAgentInput): string {
  const { prompt, plan, schemaSummary, rawSchema } = input;

  if (!rawSchema) {
    throw new Error('SqlAgent requires schema, schema is missing.');
  }

  const schemaSummaryBlock = schemaSummary
    ? `
--- SCHEMA SUMMARY START ---
${schemaSummary}
--- SCHEMA SUMMARY END ---
`.trim()
    : '';

  const schemaBlock = `
Authoritative column schema (MUST be respected):
--- SCHEMA START ---
${JSON.stringify(rawSchema)}
--- SCHEMA END ---

Rules:
- This is the exact set of allowed columns.
- Do NOT use any columns or tables that are not present here.
`.trim();

  const planBlock = `
Query plan (instruction contract):
--- PLAN START ---
${JSON.stringify(plan)}
--- PLAN END ---
`.trim();

  return `
You are the SQL agent.

User question (for context only):
--- PROMPT START ---
${prompt}
--- PROMPT END ---

${schemaSummaryBlock}

${planBlock}

${schemaBlock}

Your task:
1) Build ONE final SQL query strictly following the QUERY PLAN and SCHEMA.
2) Use ${DataMartsAiInsightsTools.SQL_DRY_RUN} to validate syntax and estimate cost.
3) If dry-run is valid, call ${DataMartsAiInsightsTools.SQL_EXECUTE} with the same SQL.

${buildOutputRules()}
`.trim();
}
