import { z } from 'zod';
import { castError } from './castError.js';

export function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: string | undefined,
  contextName: string
): z.infer<TSchema> {
  let json: unknown;

  try {
    json = JSON.parse(raw ?? '');
  } catch (error: unknown) {
    throw new Error(
      `${contextName}: Invalid JSON, message: ${castError(error).message}  content: ${raw}`
    );
  }

  try {
    return schema.parse(json);
  } catch (error: unknown) {
    throw new Error(
      `${contextName}: Failed to parse JSON with schema: ${castError(error).message}, content: ${raw}`
    );
  }
}
