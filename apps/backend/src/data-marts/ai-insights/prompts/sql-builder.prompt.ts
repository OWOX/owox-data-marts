import { AgentBudgets } from '../../../common/ai-insights/agent/types';
import { SqlAgentInput, SqlBuilderResponseSchema } from '../agent/types';
import { getLastUserMessage } from '../agent-flow/ai-assistant-orchestrator.utils';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';
import { buildStorageRelatedRulesBlock } from './storage-related-prompt.utils';
import { sanitizeSchema } from '../utils/sanitize-schema';

export function buildSqlBuilderContextSystemPrompt(input: SqlAgentInput): string | null {
  const context = input.conversationContext;
  if (!context) {
    return null;
  }

  const modeBlock = context.mode ? `SQL task mode: ${context.mode}` : 'SQL task mode: unspecified';
  const currentSourceSqlBlock = context.currentSourceSql
    ? `
Current source SQL context:
--- CURRENT SQL START ---
${context.currentSourceSql}
--- CURRENT SQL END ---
`.trim()
    : 'Current source SQL context: none';
  const snapshotBlock =
    context.conversationSnapshot != null
      ? `
Conversation snapshot (non-user memory context):
--- CONVERSATION SNAPSHOT START ---
${JSON.stringify(context.conversationSnapshot)}
--- CONVERSATION SNAPSHOT END ---
`.trim()
      : '';

  return `
${modeBlock}

${currentSourceSqlBlock}
${snapshotBlock ? `\n\n${snapshotBlock}` : ''}
`.trim();
}

export function buildSqlBuilderSystemPrompt(
  budgets: AgentBudgets,
  storageRelatedPrompt?: string | null
): string {
  const maxRows = budgets.maxRows ?? 30;
  const storageRulesBlock = buildStorageRelatedRulesBlock(storageRelatedPrompt);

  return `
You are an SQL Builder agent.

Your ONLY job is to output a single, valid, read-only SQL query that implements the provided query plan.

IMPORTANT:
- The query plan is the source of truth. Do NOT deviate from it.
- User conversation context helps disambiguate intent, but final SQL MUST follow the plan contract.
- Correctly solving the user intent from conversation history is more important than producing merely syntactically valid SQL.
- A syntactically valid query that does not answer the user intent is INVALID.

SQL construction rules (MUST follow):
- Use ONLY SELECT or WITH queries (no INSERT, UPDATE, DELETE, MERGE, or any DDL).
- Use table names ONLY from plan.tables[*].fullyQualifiedName.
  - Use fullyQualifiedName byte-to-byte exactly as provided.
  - Do not add any anything to it (e.g., aliases, version) that is not already present in the provided fullyQualifiedName.
  - Do NOT add/remove quoting. Do NOT change casing. Do NOT rewrite catalog/schema.
- Use ONLY columns that are present in plan.requiredColumnsMeta.
  - Do NOT reference any other columns, even if they appear in rawSchema.
- Build FROM/JOIN clauses using plan.tables and plan.joins (if present).
- Use dimensions as GROUP BY keys where required.
- Use metrics as aggregated expressions as defined by the plan.
- Use the chosen plan.dateField and plan.dateFilterDescription (or equivalent plan fields)
  to build the date/time WHERE clause.
- Apply additional filters from plan.whereConditions (if present).
- Apply structured filters from plan.whereSpecs (if present). Required specs must be implemented.
- Use plan.grouping as the final set of GROUP BY expressions (if present).
- Apply structured sorting from plan.orderBySpecs (if present). Required specs must be implemented.
- Always limit the number of result rows to ${maxRows} using LIMIT (or engine equivalent).
- For computed ratio/rate metrics, default output format is percentage:
  - multiply by 100 and round to 2 decimal places.
  - if the user explicitly asks for raw fraction or another precision/format, follow the user request.
- Return human-readable formatted SQL (line breaks + indentation), not a one-line query.
- Formatting must be whitespace-only: do NOT change identifiers, quoting, expressions, or query logic.

Plan metadata contract (MUST follow):
- plan.requiredColumnsMeta is an executable contract for column handling.
- For every referenced column:
  - If requiredColumnsMeta[column].resolvedIdentifier is present, you MUST use it exactly as provided
    (do NOT modify quoting/casing).
- You MUST apply requiredColumnsMeta transforms in actual query expressions (especially WHERE and metric aggregations),
  not just mention them.
- If rawSchema types conflict with requiredColumnsMeta, treat requiredColumnsMeta as preferred intent and reconcile
  with safe explicit conversion.

Date/time transform execution (MUST follow):
- Treat requiredColumnsMeta[*].transform as an already-decided contract from planning.
- If transform.kind is "parse_date" or "parse_timestamp", implement it only with transform.format/preNormalize from the plan.
- Do NOT infer, guess, or alter parsing formats/preNormalize rules at SQL-builder stage.
- If transform.format is present for a date/timestamp field, implement typed date filtering/comparison (parsed value vs typed date/timestamp bounds).
- Do NOT use LIKE/ILIKE/prefix string filtering for date intent when transform.format is present.

Division safety rule (MUST follow):
- For any expression that divides by another value, guard denominator against zero/null using storageType-native safe idiom.
- Examples: BigQuery SAFE_DIVIDE(numerator, denominator); ANSI-like engines numerator / NULLIF(denominator, 0).
- This rule applies to derived metrics and ordering expressions whenever division is present.

Pre-normalization rule (MUST follow):
- If requiredColumnsMeta[column].transform.preNormalize is present, you MUST implement it using
  deterministic REPLACE / REGEXP_REPLACE (or storageType equivalents).
- Using TRIM to remove a specific prefix/suffix is forbidden.

Correctness rule:
- It is better to return an explicit error than to return a silently incorrect or empty result.
- Do NOT produce queries that may succeed syntactically but violate the intended time semantics.
- [important] Do not use safe casting/parsing functions (e.g., TRY_CAST, TRY_TO_DATE, SAFE_CAST, SAFE_PARSE etc.) to hide errors.
- SAFE_DIVIDE (or storageType equivalent) is allowed for divide-by-zero protection.
- Internal self-check before final output:
  - all required metricSpecs are implemented with correct aggregation;
  - GROUP BY matches plan.grouping;
  - required whereSpecs are implemented;
  - required orderBySpecs are implemented;
  - query answers the user intent derived from conversation history.

${storageRulesBlock}

${buildJsonFormatSection(SqlBuilderResponseSchema)}
`.trim();
}

export function buildSqlBuilderUserPrompt(input: SqlAgentInput): string {
  const { prompt, plan, schemaSummary, rawSchema, conversationContext } = input;
  const turns = conversationContext?.turns;
  const latestUserMessage = getLastUserMessage(turns ?? []) || prompt;

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
${JSON.stringify(sanitizeSchema(rawSchema))}
--- SCHEMA END ---
`.trim()
    : '';

  return `
Latest user request to satisfy:
--- USER REQUEST START ---
${latestUserMessage}
--- USER REQUEST END ---

${schemaSummaryBlock}

${planBlock}

${schemaBlock}

Your task:
- The SQL must implement the plan exactly and be executable.
- Apply required transforms and use resolvedIdentifier as instructed.
- Implement metricSpecs/whereSpecs/orderBySpecs when present and required.
- Always enforce the row limit.

${buildOutputRules()}
`.trim();
}
