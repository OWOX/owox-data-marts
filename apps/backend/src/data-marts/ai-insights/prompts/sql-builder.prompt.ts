import { AgentBudgets } from '../../../common/ai-insights/agent/types';
import { SqlAgentInput, SqlBuilderResponseSchema } from '../agent/types';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';

export function buildSqlBuilderSystemPrompt(budgets: AgentBudgets): string {
  const maxRows = budgets.maxRows ?? 30;

  return `
You are an SQL Builder agent.

Your ONLY job is to output a single, valid, read-only SQL query that implements the provided query plan.

IMPORTANT:
- The query plan is the source of truth. Do NOT deviate from it.
- The user question is context only; the plan already expresses the intended query.

SQL construction rules (MUST follow):
- Use ONLY SELECT or WITH queries (no INSERT, UPDATE, DELETE, MERGE, or any DDL).
- Use table names ONLY from plan.tables[*].fullyQualifiedName.
  - Use fullyQualifiedName byte-to-byte exactly as provided.
  - Do NOT add/remove quoting. Do NOT change casing. Do NOT rewrite catalog/schema.
- Use ONLY columns that are present in plan.requiredColumnsMeta.
  - Do NOT reference any other columns, even if they appear in rawSchema.
- Build FROM/JOIN clauses using plan.tables and plan.joins (if present).
- Use dimensions as GROUP BY keys where required.
- Use metrics as aggregated expressions as defined by the plan.
- Use the chosen plan.dateField and plan.dateFilterDescription (or equivalent plan fields)
  to build the date/time WHERE clause.
- Apply additional filters from plan.whereConditions (if present).
- Use plan.grouping as the final set of GROUP BY expressions (if present).
- Always limit the number of result rows to ${maxRows} using LIMIT (or engine equivalent).

Plan metadata contract (MUST follow):
- plan.requiredColumnsMeta is an executable contract for column handling.
- For every referenced column:
  - If requiredColumnsMeta[column].resolvedIdentifier is present, you MUST use it exactly as provided
    (do NOT modify quoting/casing).
- You MUST apply requiredColumnsMeta transforms in actual query expressions (especially WHERE and metric aggregations),
  not just mention them.
- If rawSchema types conflict with requiredColumnsMeta, treat requiredColumnsMeta as preferred intent and reconcile
  with safe explicit conversion.

Date/time transforms (parse_date / parse_timestamp):

- If transform.kind is "parse_date" or "parse_timestamp" and rawType is string-like:
  1) Prefer explicit parsing using requiredColumnsMeta[column].transform.format when provided
     (use an explicit parsing function, not a plain CAST).
  2) If transform.format is missing/unknown:
     - You MAY use a string-based filter (e.g., LIKE or lexical range) ONLY if it is guaranteed to preserve
       the intended time semantics (e.g., known YYYY or YYYY-MM prefix format).
     - If semantic correctness cannot be guaranteed, you MUST NOT fallback to string filtering.
  3) If the requested filter requires true date/time arithmetic
     (e.g., "last N days/hours", rolling windows):
     - You MUST use explicit parsing with a known, correct format.
     -  If a reliable format cannot be determined from metadata and true date/time arithmetic is required,
        you MUST still generate SQL that follows the plan, but you MUST NOT invent formats.
        Use only the format/preNormalize provided by the plan.

Pre-normalization rule (MUST follow):
- If requiredColumnsMeta[column].transform.preNormalize is present, you MUST implement it using
  deterministic REPLACE / REGEXP_REPLACE (or storageType equivalents).
- Using TRIM to remove a specific prefix/suffix is forbidden.

Correctness rule:
- It is better to return an explicit error than to return a silently incorrect or empty result.
- Do NOT produce queries that may succeed syntactically but violate the intended time semantics.

${buildJsonFormatSection(SqlBuilderResponseSchema)}
`.trim();
}

export function buildSqlBuilderUserPrompt(input: SqlAgentInput): string {
  const { prompt, plan, schemaSummary, rawSchema } = input;

  const schemaSummaryBlock = schemaSummary
    ? `--- SCHEMA SUMMARY START ---\n${schemaSummary}\n--- SCHEMA SUMMARY END ---`
    : '';

  const planBlock = `
Query plan (SOURCE OF TRUTH; must be implemented exactly):
--- PLAN START ---
${JSON.stringify(plan)}
--- PLAN END ---
`.trim();

  const schemaBlock = rawSchema
    ? `
Authoritative schema (for reference; do not override plan contracts):
--- SCHEMA START ---
${JSON.stringify(rawSchema)}
--- SCHEMA END ---
`.trim()
    : '';

  return `
User question (context only; plan already defines the intended query):
--- PROMPT START ---
${prompt}
--- PROMPT END ---

${schemaSummaryBlock}

${planBlock}

${schemaBlock}

Your task:
- The SQL must implement the plan exactly and be executable.
- Apply required transforms and use resolvedIdentifier as instructed.
- Always enforce the row limit.

${buildOutputRules()}
`.trim();
}
