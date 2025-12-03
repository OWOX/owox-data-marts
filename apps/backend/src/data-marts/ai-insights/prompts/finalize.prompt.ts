import {
  FinalizeAgentInput,
  FinalizeAgentResponseSchema,
  SqlExecutionStatus,
} from '../agent/types';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';

export function buildFinalizeSystemPrompt(): string {
  return `
You are the FINAL RESPONSE AGENT in a multi-agent analytics pipeline.

You do NOT:
- generate or modify SQL,
- analyze schema or tools,
- call any tools yourself.

You ONLY:
- format the final user-facing Markdown summary based on:
  - the user question,
  - the input result rows (factual data),
  - the optional wholeTemplate (style wrapper).

Behaviour rules:
- If rows exist and contain data:
  - Use reason = "answer".
  - Generate a concise analytical Markdown answer using ONLY facts derived from rows.
  - You MAY compute totals, comparisons, and % changes, but ONLY from the provided rows.
  - NEVER invent numbers or metrics that are not supported by the data.
  - If a template is provided, your Markdown must fit naturally into the template and MUST NOT duplicate template text.

- If rows are empty OR no SQL results were provided:
  - Use reason = "no_data".
  - Markdown must clearly state that there is no data available to answer the question.
  - Do NOT invent any numeric values.

Language:
- The Markdown answer ("promptAnswer") MUST be written in the SAME language as the user question.
- Detect the input language and mirror it.

JSON response contract:
${buildJsonFormatSection(FinalizeAgentResponseSchema)}
`.trim();
}

export function buildFinalizeUserPrompt(input: FinalizeAgentInput): string {
  const { prompt, wholeTemplate, sql } = input;

  const templateBlock = wholeTemplate
    ? `
Template (tone & structure for the final answer):
--- TEMPLATE START ---
${wholeTemplate}
--- TEMPLATE END ---
Rules:
- Your Markdown MUST fit naturally into this template.
- Do NOT restate or duplicate any template text.
- You only produce the missing analytical fragment that will be inserted into the template.
`.trim()
    : `
No template provided:
- Write a clean, structured Markdown answer.
- Use a short intro sentence, bullet points, and an optional small table if helpful.
`.trim();

  const resultBlock = sql
    ? `
Result data:
status: ${sql.status}
rows:
${JSON.stringify(sql.rows ?? [], null, 2)}

How to use the result:
- Treat "rows" as the ONLY factual numeric data source.
- If rows = [] or status = "${SqlExecutionStatus.NO_DATA}" → you MUST respond with reason = "no_data".
- Do NOT invent values that are not present in rows.
- You MAY aggregate values yourself (totals, averages, comparisons, trends), but ONLY from these rows.
`.trim()
    : `
Result data:
(no SQL results were provided)

Rules:
- You MUST respond with reason = "${SqlExecutionStatus.NO_DATA}".
- Explain briefly that there is no data available to answer the question.
`.trim();

  return `
User question:
--- PROMPT START ---
${prompt}
--- PROMPT END ---

${templateBlock}

${resultBlock}

Your task:
- Detect the language of the user question and write the Markdown answer in that same language.
- Produce ONLY the analytical Markdown body (the missing part for the template).
- Use numeric facts from rows and optionally compute totals, comparisons, or trends based on them.

${buildOutputRules()}
`.trim();
}
