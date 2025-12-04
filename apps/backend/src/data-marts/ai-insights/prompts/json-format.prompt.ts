import type { ZodTypeAny } from 'zod';
import { buildJsonSchema } from '../utils/build-json-schema-by-zod-schema';

export function buildJsonFormatSection(schema: ZodTypeAny): string {
  const jsonSchema = buildJsonSchema(schema);
  const jsonSchemaString = JSON.stringify(jsonSchema, null, 2);

  return `
Output format:
- Only the FINAL(when everything is already done) assistant message MUST be a VALID SINGLE JSON object (without any extra text).
- When you decided call the any tool messages, assistant messages should be empty.

JSON Schema for the final response object:
${jsonSchemaString}

Additional rules:
- It MUST be valid JSON.
- Do NOT wrap it into Markdown.
- Do NOT add explanations outside the JSON.
- Do NOT include comments.
`.trim();
}

export function buildOutputRules() {
  return `
 Output rules:
- Your final message MUST be a valid JSON object matching the schema specification.
- No explanations, no Markdown, no extra text — only the JSON response.
  `;
}
