import { ValueTransformer } from 'typeorm';
import { ZodTypeAny } from 'zod';

/**
 * Creates a value transformer that uses a Zod schema for validation.
 *
 * @param {ZodTypeAny} schema - The Zod schema used to validate and transform the value.
 * @return {ValueTransformer} A value transformer object that validates data using the provided schema during both `to` and `from` operations.
 */
export function createZodTransformer<T>(schema: ZodTypeAny): ValueTransformer {
  return {
    to(value: T): T {
      return schema.parse(value); // validate before save
    },
    from(value: unknown): T {
      return schema.parse(value); // validate after load
    },
  };
}
