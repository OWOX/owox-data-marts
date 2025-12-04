import zodToJsonSchemaOriginal from 'zod-to-json-schema';
import { ZodTypeAny } from 'zod';

const zodToJsonSchema: (schema: ZodTypeAny) => unknown = zodToJsonSchemaOriginal as unknown as (
  schema: ZodTypeAny
) => unknown;

export function buildJsonSchema(schema: ZodTypeAny): unknown {
  return zodToJsonSchema(schema);
}
