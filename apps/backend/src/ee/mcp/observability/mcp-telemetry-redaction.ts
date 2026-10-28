import { Core } from '@owox/connectors';
import { z } from 'zod-v4';

export const REDACT_KEYS =
  /(authorization|bearer|cookie|token|secret|password|passwd|api[_-]?key|private[_-]?key|credential)/i;
export const REDACTED = '[REDACTED]';
const MAX_DEPTH = 16;
const objectSchema = z.record(z.string(), z.unknown());
const connectorPayloadSchema = z.object({ manifest: objectSchema }).loose();

function redact(value: unknown, secretNames: Set<string>, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map(item => redact(item, secretNames, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    out[key] =
      secretNames.has(key) || REDACT_KEYS.test(key)
        ? REDACTED
        : redact(item, secretNames, depth + 1);
  }
  return out;
}

function maskParameters(value: unknown, secretNames: Set<string>, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  const parsed = objectSchema.safeParse(value);
  if (!parsed.success) return value;
  return Object.fromEntries(
    Object.entries(parsed.data).map(([name, raw]) => {
      const definition = objectSchema.safeParse(raw);
      if (!definition.success) return [name, raw];
      const parameter = { ...definition.data };
      if (
        secretNames.has(name) ||
        (Array.isArray(parameter.attributes) && parameter.attributes.includes('SECRET'))
      ) {
        secretNames.add(name);
        for (const key of ['default', 'placeholder', 'options']) {
          if (key in parameter) parameter[key] = REDACTED;
        }
      }
      if (Array.isArray(parameter.oneOf)) {
        parameter.oneOf = parameter.oneOf.map(rawOption => {
          const option = objectSchema.safeParse(rawOption);
          if (!option.success || !('items' in option.data)) return rawOption;
          return {
            ...option.data,
            items: maskParameters(option.data.items, secretNames, depth + 1),
          };
        });
      }
      return [name, parameter];
    })
  );
}

export function redactMcpTelemetry(value: unknown): unknown {
  const parsed = connectorPayloadSchema.safeParse(value);
  if (!parsed.success) return redact(value, new Set());

  const { manifest, configuration, ...rest } = parsed.data;
  const secretNames = new Set<string>(
    new Core.ManifestParser().getAuthenticationParameterNames(manifest.authentication)
  );
  const { parameters, ...manifestContent } = manifest;
  const maskedParameters = maskParameters(parameters, secretNames);
  const maskedManifest = {
    ...(redact(manifestContent, secretNames) as Record<string, unknown>),
    ...('parameters' in manifest ? { parameters: maskedParameters } : {}),
  };
  return {
    ...(redact(rest, new Set()) as Record<string, unknown>),
    manifest: maskedManifest,
    ...('configuration' in parsed.data
      ? { configuration: redact(configuration, secretNames) }
      : {}),
  };
}
