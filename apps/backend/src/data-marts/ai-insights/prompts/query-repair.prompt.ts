import { AgentBudgets } from '../../../common/ai-insights/agent/types';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';
import { QueryPlan, QueryRepairResponseSchema } from '../agent/types';
import { GetMetadataOutput, SqlStepError } from '../ai-insights-types';

export function buildQueryRepairSystemPrompt(budgets: AgentBudgets): string {
  const maxRows = budgets.maxRows ?? 30;

  return `
You are a Query Repair agent.

Your ONLY job:
- Produce a repaired SQL query that fixes the latest failure (CURRENT attempt).
- Analyze the error and apply minimal, storageType-correct changes so the SQL executes successfully
  while preserving the plan intent.

Constraints:
- Output JSON only matching the contract below.
- SQL must be a single read-only SELECT/WITH query (no DDL/DML).
- Always include LIMIT ${maxRows} (or engine equivalent).
- It is forbidden to return the same SQL as the CURRENT attempt (ignoring whitespace).
- Prefer correctness over "making it run". It is better to fail than to return misleading or empty results.
- Do NOT rely on TRY/SAFE parsing semantics to hide errors.

StorageType-aware repair (MUST follow):
- You MUST generate SQL that matches the target StorageType shown in the user prompt.
- If requiredColumnsMeta[column].transform.format is present, treat it as a parsing hint.
  If the error message or schema examples prove the format is incompatible with real values,
  you MAY override it with a corrected storageType-native format, as long as you preserve the plan intent.
- If requiredColumnsMeta[column].transform.preNormalize is present, you MUST apply those steps before parsing.
- You MAY introduce minimal deterministic pre-normalization (e.g., remove " (....)" suffix)
  if the error message or schema examples show extra text not covered by the parsing format.

Plan contract (MUST follow):
- Use only tables from plan.tables[*].fullyQualifiedName exactly as given.
- Use only columns from plan.requiredColumnsMeta.
- Use requiredColumnsMeta[column].resolvedIdentifier exactly as provided.
- Apply transforms in real expressions (WHERE, metrics), not just notes.

Mandatory change rule:
- The repaired SQL MUST remove or change the failing expression/pattern that triggered the CURRENT error.
  If the CURRENT error is a parse/format error, you MUST modify the parsing logic
  (format and/or pre-normalization) so it matches actual example values.

Date/time parsing policy:
- When fixing parse_date/parse_timestamp errors for string-like columns:
  - Treat the failing value from the error message (and schema examples) as a test case:
    your repaired expression MUST be able to parse it after preNormalize.
  - Apply plan.transform.preNormalize first (if present). You MAY add minimal deterministic preNormalize
    if evidence from error/examples shows extra text.
  - Use explicit parsing with storageType-native tokens (never plain CAST and never TRY/SAFE).
  - If plan.transform.format is present but incompatible with real values, you MAY override it with a compatible
    storageType-native format that preserves the plan intent.
  - If the input contains fixed literals (e.g., "GMT", "UTC", "T", "Z") that remain after preNormalize,
    you MUST either remove them deterministically or include them as quoted literals in the format.
  - If the required time filter implies true date arithmetic (e.g., "last N days/months"),
    and you cannot establish a reliable parse, return action="cannot_repair".

Division by zero policy:
- Repair by making division safe while preserving intent (e.g., denominator != 0 filter or NULLIF),
  but do NOT silently change semantics beyond what the user likely expects.

${buildJsonFormatSection(QueryRepairResponseSchema)}
`.trim();
}

export function buildQueryRepairUserPrompt(input: {
  prompt: string;
  plan: QueryPlan;
  rawSchema?: GetMetadataOutput;
  attempts: Array<{ sql: string; error: SqlStepError }>;
}): string {
  const planBlock = `
Query plan (SOURCE OF TRUTH for intent):
--- PLAN START ---
${JSON.stringify(input.plan)}
--- PLAN END ---
`.trim();

  const schemaBlock = `
Raw schema (user controlled metadata):
--- SCHEMA START ---
${input.rawSchema ? JSON.stringify(input.rawSchema) : '(no schema provided)'}
--- SCHEMA END ---

Schema guidance:
- Column descriptions may include example values. Treat these examples as authoritative evidence of the real string format.
`.trim();

  const attemptsBlock = `
Attempts history (ordered from oldest to newest).
The LAST attempt is the CURRENT SQL that MUST be repaired.

${input.attempts
  .map((a, i) =>
    `
Attempt #${i + 1}${i === input.attempts.length - 1 ? ' (CURRENT)' : ''}:
SQL:
--- SQL START ---
${a.sql}
--- SQL END ---
Error kind: ${a.error.kind}
Estimated bytes: ${a.error.bytes ?? 'n/a'}
Error message:
--- ERROR START ---
${a.error.message}
--- ERROR END ---
`.trim()
  )
  .join('\n\n')}
`.trim();

  return `
User question:
--- PROMPT START ---
${input.prompt}
--- PROMPT END ---

StorageType is ${input.rawSchema?.storageType ?? 'unknown'}.

${planBlock}

${schemaBlock}

${attemptsBlock}

${buildOutputRules()}
`.trim();
}
