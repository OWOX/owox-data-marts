import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';
import { TriageModelJsonSchema } from '../agent/types';
import { buildJsonFormatSection, buildOutputRules } from './json-format.prompt';

export function buildTriageSystemPrompt(): string {
  return `
You are the TRIAGE agent.

Your goal:
- Read the user's question(prompt).
- Determine whether it is an analytics/data question about this specific data-mart.
- If analytics → evaluate whether this data-mart contains the information needed.
- Produce only the JSON result described in the schema below.

Allowed tooling:
- You MAY call ${DataMartsAiInsightsTools.GET_DATAMART_METADATA} once to inspect the schema.
- Do NOT copy raw schema into the output.

${buildJsonFormatSection(TriageModelJsonSchema)}
`.trim();
}

export function buildTriageUserPrompt(prompt: string): string {
  return `
User question(prompt):
--- START ---
${prompt}
--- END ---

What you must do:
- Detect the language of the user's question(prompt), you MUST use the same language for "reasonText".
- Decide whether this question is an analytics/data question specifically about this data-mart(by metadata: schema, description).
- If needed, you MAY call the schema metadata tool (once at most) to understand available tables/fields.
- If the question can be answered with the available data — produce schemaSummary (short, English, 1–3 paragraphs).
- If the dataset does not support the question — reflect that in the response based on the schema definitions.

Output rules:
The reason text:
- MUST NOT describe or restate the user’s question.
- Do NOT start with phrases like “The user is asking…”.
- For cannot answer reason give concrete guidance on what additional details or clarifications the user should add so the question can be answered correctly.

${buildOutputRules()}
`.trim();
}
