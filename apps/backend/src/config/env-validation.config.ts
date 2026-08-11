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

    MAX_CONNECTOR_RUNS_PER_PROJECT: z.coerce.number().int().min(1).max(1000).default(3),
    MAX_REPORT_RUNS_PER_PROJECT: z.coerce.number().int().min(1).max(1000).default(1000),

    // A live connector test (POST /connectors/custom/test) spawns a real Node child that
    // drives outbound HTTP to a host the manifest author controls, so one test costs a whole
    // process, not a request. Both caps bound processes in flight on THIS instance: the
    // per-project one keeps a single project from taking the host, and the total keeps many
    // projects from doing together what none can do alone. Per-project mirrors
    // MAX_CONNECTOR_RUNS_PER_PROJECT, which bounds the same class of work for scheduled runs.
    MAX_CONNECTOR_TESTS_PER_PROJECT: z.coerce.number().int().min(1).max(1000).default(3),
    MAX_CONNECTOR_TESTS_TOTAL: z.coerce.number().int().min(1).max(1000).default(10),

    // Incremental run-log flush period. Validated here rather than left to passthrough
    // because the consumer's own guard cannot catch a bad value: `'abc' <= 0` is false, so
    // the flusher is armed anyway, and setInterval(fn, NaN) clamps to ~1ms -- a busy loop
    // writing the whole log buffer to the database for the entire run. Coercing here turns
    // that into a boot-time failure. 0 stays legal: it is the documented switch that
    // disables streaming and defers logs to the single terminal write.
    CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(3_600_000)
      .default(2_000),

    // Plugin host. GITHUB_* stay unvalidated pass-through strings: they are optional and
    // mode-dependent, and PluginHostConfigService already treats a blank value as absent.
    PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC: z.coerce.number().int().min(0).max(86_400).optional(),
    PLUGIN_HOST_REMOTE_PROBE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(8_000),
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
