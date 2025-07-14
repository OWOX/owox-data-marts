import { ValueTransformer } from 'typeorm';
import { ZodTypeAny } from 'zod';

/**
 * Creates a value transformer that uses a Zod schema for validation.
 *
 * @param {ZodTypeAny} schema - The Zod schema used to validate and transform the value.
 * @param {boolean} isRequired - If entity presence is strictly required.
 * @return {ValueTransformer} A value transformer object that validates data using the provided schema during both `to` and `from` operations.
 */
export function createZodTransformer<T>(
  schema: ZodTypeAny,
  isRequired: boolean = true
): ValueTransformer {
  return {
    to(value: T): T {
      // validate before save
      if (!isRequired && (value === null || value === undefined)) {
        return value;
      }
      return schema.parse(value);
    },
    from(value: unknown): T {
      // validate after load
      if (!isRequired && (value === null || value === undefined)) {
        return value as T;
      }
      return schema.parse(value);
    },
  };
}
