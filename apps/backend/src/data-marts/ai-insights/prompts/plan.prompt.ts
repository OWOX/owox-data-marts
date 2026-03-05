import { PlanAgentInput, PlanModelJsonSchema } from '../agent/types';
import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';
import { getLastUserMessage } from '../agent-flow/ai-assistant-orchestrator.utils';

export function buildPlanContextSystemPrompt(input: PlanAgentInput): string | null {
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

export function buildPlanSystemPrompt(input: PlanAgentInput): string {
  return `
You are the PLAN agent in a multi-step analytics pipeline.

Your role:
- Read the user's analytics request from conversation history and context.
- Design a single, coherent query plan that can later be translated into SQL by another agent.
- Choose the appropriate fact table(s), dimensions, metrics, filters, and date field.

Tool usage:
- To resolve physical table names, you MAY call ${DataMartsAiInsightsTools.GET_TABLE_FULLY_QUALIFIED_NAME}.
- Use this tool only to obtain correct fullyQualifiedName values for tables.
- Do NOT generate or output SQL yourself.
- Do NOT add any symbols, quoting, or formatting to table names obtained from the tool; use them byte-to-byte as returned.

StorageType-aware planning:
- Target storageType (authoritative): ${input.rawSchema?.storageType ?? 'unknown'}
- You MUST take this storageType into account when producing requiredColumnsMeta.
- You MUST produce metricSpecs/whereSpecs/orderBySpecs as structured SQL contracts.
- Provide requiredColumnsMeta for every column in requiredColumns using rawSchema:
  - rawType
  - semanticType
  - resolvedIdentifier (exact column identifier for this storageType; already quoted if required)
  - transform ("none" | "cast" | "parse_date" | "parse_timestamp"), optionally:
    - format (storageType-native format tokens),
    - preNormalize (declarative cleanup steps, NO SQL).
- If you provide transform.format, it MUST use the target storageType's native format tokens
  (e.g., BigQuery, Snowflake, Redshift, Athena etc.).
- If you output transform.preNormalize, it MUST be machine-actionable:
  include concrete parameters (e.g., suffix/prefix or regex pattern), not only a vague note.
- If a required column is used for date/timestamp filtering and rawType is a string-like type,
  transform MUST be "parse_date" or "parse_timestamp" (not "none").
- requiredColumnsMeta must be abstract and MUST NOT contain SQL expressions.

Date/time parsing contract (IMPORTANT):

- If schema metadata and/or SAMPLE_TABLE_DATA provide enough evidence to determine
  a reliable date/timestamp format for a string-like column, you MUST:
  - set transform.kind to "parse_date" or "parse_timestamp",
  - set requiredColumnsMeta[column].transform.format,
  - plan typed date filters via whereSpecs operators such as =, between, >=, < (as applicable),
  - avoid lexical date filtering (LIKE/ILIKE/prefix matching) for date intent.

- If you set transform.kind to "parse_date" or "parse_timestamp" for a string-like rawType
  AND the query requires true date/time arithmetic
  (e.g., "last N days/hours", rolling windows, "yesterday"),
  you MUST provide requiredColumnsMeta[column].transform.format (a concrete format string)
  so SQL generation can be correct.

- If schema metadata includes example values for the column and parsing is needed:
  - Your transform.format MUST be compatible with those examples.
  - Compatibility means: the combination of (transform.preNormalize + transform.format)
    must be able to parse the example value end-to-end.
  - If examples include extra prefix/suffix text not covered by the format (e.g., "(...)" ),
    you MUST describe deterministic cleanup via transform.preNormalize so parsing can succeed.
  - If the example contains fixed literal text that is part of the datetime string
    (e.g., "GMT", "UTC", "T", "Z", fixed separators),
    you MUST account for it:
    - either remove it deterministically via transform.preNormalize, OR
    - include it as a quoted literal in transform.format using storageType-native quoting rules.

- If you cannot determine a reliable format from schema metadata
  (e.g., column description lacks examples/format hints OR examples contain extra text and no preNormalize evidence exists):

  - you MUST NOT guess the format, and you MUST NOT invent preNormalize steps without evidence from schema examples.
  - you MUST NOT use lexical date filtering as a fallback for date intent.
  - you MUST NOT use TRY/SAFE parsing semantics.
  - In this case, you MUST mark the plan as ambiguous and request clarification from the user
    (e.g., ask for example values, exact format, or schema type correction).

Numeric casting contract (IMPORTANT):
- If a required column has rawType string-like and semanticType is "number":
  - Do NOT assume integer-only values.
  - If the metric can be fractional (money, ratios, averages), plan casting to a fractional-capable type.
  - Prefer to set transform.kind="cast" with a fractional-capable intent (e.g., document in notes/semantics),
    or (if your schema supports it) include a target type hint (e.g., DOUBLE or DECIMAL with scale > 0).
  - If precision is critical and the schema metadata does not clarify scale/precision, mark the plan as ambiguous
    and request clarification (e.g., "is spend integer or decimal, and how many decimal places?").

Correctness rule:
- Prefer explicit clarification over guessing.
- It is better to request clarification than to risk empty or misleading results.
- A plan that is syntactically complete but does not solve the user intent from conversation history is invalid.

Data sampling:
- If the query plan involves filtering, casting, or parsing columns that have
  a string-like rawType (e.g., dates stored as STRING, numeric strings, enums),
  call ${DataMartsAiInsightsTools.SAMPLE_TABLE_DATA} ONCE with the relevant column names
  to see actual data samples.
- Do NOT call this tool if all required columns have unambiguous native types
  (DATE, TIMESTAMP, INT64, FLOAT64, etc.) that need no format guessing.
- Use the returned sample rows to determine the correct transform.format,
  transform.preNormalize, or casting strategy for string-typed columns.

Filter value resolution:
- After reviewing sample data, if a user-requested filter value cannot be
  confidently mapped to the actual stored values (e.g., user says "Ukraine"
  but sample data shows ISO codes like "US", "DE" and you cannot determine
  the exact code for the requested country), mark the plan as ambiguous.
- In ambiguityExplanation, ask the user to clarify the exact filter value,
  showing examples of actual values from the data.
  Example: "The column 'country' stores ISO codes (e.g., 'US', 'DE').
  Could you specify the exact code for Ukraine? It might be 'UA' or 'UKR'."
- Do NOT guess filter values when sample data does not contain a clear match.

${buildJsonFormatSection(PlanModelJsonSchema)}
`.trim();
}

export function buildPlanUserPrompt(input: PlanAgentInput): string {
  const { prompt, schemaSummary, rawSchema, conversationContext } = input;
  const turns = conversationContext?.turns;
  const latestUserMessage = getLastUserMessage(turns ?? []) || prompt;
  const conversationHint =
    turns && turns.length > 0
      ? 'Conversation turns are provided as separate chat messages above.'
      : 'Conversation turns were not provided separately; use the latest request below as context.';

  return `
Latest user request to plan for:
--- USER REQUEST START ---
${latestUserMessage}
--- USER REQUEST END ---

${conversationHint}

Schema summary (primary reference):
${schemaSummary ?? '(not provided)'}

Raw table schema (columns):
${rawSchema ? JSON.stringify(rawSchema) : '(omitted)'}

StorageType is ${input.rawSchema?.storageType ?? 'unknown'}.

- If the user question is ambiguous, provide an ambiguityExplanation.
- The ambiguityExplanation MUST be written in the same language as the user question (detected language: ${input.promptLanguage}).
- The explanation MUST clearly tell the user what exactly is unclear.
- The explanation MUST give concrete guidance on what additional details or clarifications the user should add so the question can be answered correctly.
- The explanation MUST NOT describe or paraphrase the user’s question itself.
- Do NOT start with phrases like “The user is asking…”.
- No meta-commentary, no analysis of intent — only a clear description of what information is missing or ambiguous.

Instructions:
- Use the schema summary as the main source of truth for available tables, dimensions, and metrics.
- If you need exact physical table names, you MAY call ${DataMartsAiInsightsTools.GET_TABLE_FULLY_QUALIFIED_NAME} to obtain fullyQualifiedName values.
- Construct ONE coherent query plan that could be translated into a single SQL query.
- Carefully choose:
  - the main fact table(s),
  - relevant dimensions and metrics,
  - metricSpecs[] with required aggregation/source/alias for every metric used,
  - the primary dateField and dateFilterDescription (if the question implies a time range),
  - whereConditions + whereSpecs (structured filters),
  - grouping,
  - orderBySpecs (structured sorting when needed),
  - requiredColumns so that the SQL agent has all necessary fields.
- When schema column descriptions include example values or format hints, use them to define parsing/casting transforms.
- If filtering or sorting is needed by user intent, corresponding whereSpecs/orderBySpecs MUST be non-empty.

${buildOutputRules()}
`.trim();
}
