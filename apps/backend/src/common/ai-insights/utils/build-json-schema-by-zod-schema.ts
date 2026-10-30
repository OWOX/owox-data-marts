import { z } from 'zod';

// The model writes what the schema then parses, so describe its input side.
export function buildJsonSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { target: 'draft-7', io: 'input' });
}
