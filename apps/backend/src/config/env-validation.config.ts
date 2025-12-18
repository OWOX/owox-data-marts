import { z } from 'zod';
import {
  DEFAULT_HEADERS_TIMEOUT_MS,
  DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
  DEFAULT_SERVER_TIMEOUT_MS,
} from './constants';

/**
 * Configuration schema for environment variables validation.
 * Validates and transforms specified environment variables while
 * passing through all other fields as-is for backwards compatibility.
 */
const configSchema = z
  .object({
    SCHEDULER_EXECUTION_ENABLED: z
      .string()
      .trim()
      .toLowerCase()
      .default('true')
      .transform(val => val !== 'false'),

    SCHEDULER_TIMEZONE: z.string().trim().default('UTC'),

    SERVER_TIMEOUT_MS: z.coerce.number().default(DEFAULT_SERVER_TIMEOUT_MS),
    KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().default(DEFAULT_KEEP_ALIVE_TIMEOUT_MS),
    HEADERS_TIMEOUT_MS: z.coerce.number().default(DEFAULT_HEADERS_TIMEOUT_MS),
  })
  .passthrough(); // Pass through all other fields as-is

/**
 * Inferred configuration type from the validation schema.
 *
 * This type includes all validated fields with their transformed types
 * plus any additional fields that are passed through unchanged.
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Validates the provided configuration object against the schema.
 *
 * Performs validation and transformation of environment variables according to
 * the defined schema. Unknown fields are passed through unchanged.
 *
 * @param config - Raw configuration object (typically process.env)
 * @returns Validated and transformed configuration object
 * @throws {Error} When validation fails with detailed error message
 *
 * @example
 * ```typescript
 * const config = validateConfig(process.env);
 * console.log(config.SCHEDULER_EXECUTION_ENABLED); // boolean: true or false
 * console.log(config.SCHEDULER_TIMEZONE); // string: 'UTC' or provided value
 * ```
 */
export function validateConfig(config: Record<string, unknown>): Config {
  const result = configSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Configuration validation failed: ${result.error.message}`);
  }

  return result.data;
}
