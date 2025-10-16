import { z } from 'zod';
import type { EventBusConfig } from './types.js';
import { LoggerFactory } from '../../logging/logger-factory.js';
import type { Logger } from '../../logging/types.js';

/**
 * Environment variable name that controls enabled event transports.
 * Example: INTEGRATIONS_TRANSPORTS=logger,posthog
 */
export const INTEGRATIONS_TRANSPORTS_ENV = 'INTEGRATIONS_TRANSPORTS';

const transportsSchema = z
  .string()
  .min(1)
  .transform(val =>
    val
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
  );

const envSchema = z.object({
  [INTEGRATIONS_TRANSPORTS_ENV]: z.string().optional(),
});

/**
 * Resolve configuration for EventBus from environment variables.
 * Falls back to ["logger"] when the variable is absent or empty.
 */
export function resolveEventBusConfig(env: NodeJS.ProcessEnv = process.env): EventBusConfig {
  const logger: Logger = LoggerFactory.createNamedLogger('EventBusConfig');
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    // Should not normally happen; if it does, fall back to logger only
    logger.info('Failed to parse event bus environment, falling back to logger transport', {
      issue: parsed.error.flatten(),
    });
    return { enabledTransports: ['logger'] };
  }

  const val = parsed.data[INTEGRATIONS_TRANSPORTS_ENV];
  if (!val) {
    // default single logger transport
    return { enabledTransports: ['logger'] };
  }

  const list = transportsSchema.safeParse(val);
  if (!list.success) {
    logger.warn('Invalid INTEGRATIONS_TRANSPORTS value, using default logger transport', {
      issue: list.error.flatten(),
      value: val,
    });
    return { enabledTransports: ['logger'] };
  }

  if (list.data.length === 0) {
    return { enabledTransports: ['logger'] };
  }

  return { enabledTransports: list.data };
}
