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
  if (!parsed.success) return redact(value, new Set(), depth);
  return Object.fromEntries(
    Object.entries(parsed.data).map(([name, raw]) => {
      const definition = objectSchema.safeParse(raw);
      if (!definition.success) return [name, redact(raw, new Set(), depth + 1)];
      const { oneOf, ...fields } = definition.data;
      const parameter = redact(fields, new Set(), depth + 1) as Record<string, unknown>;
      if (
        secretNames.has(name) ||
        (Array.isArray(parameter.attributes) && parameter.attributes.includes('SECRET'))
      ) {
        secretNames.add(name);
        for (const key of ['default', 'placeholder', 'options']) {
          if (key in parameter) parameter[key] = REDACTED;
        }
      }
      if ('oneOf' in definition.data) {
        parameter.oneOf = Array.isArray(oneOf)
          ? oneOf.map(rawOption => {
              const option = objectSchema.safeParse(rawOption);
              if (!option.success) return redact(rawOption, new Set(), depth + 1);
              const { items, ...metadata } = option.data;
              return {
                ...(redact(metadata, new Set(), depth + 1) as Record<string, unknown>),
                ...('items' in option.data
                  ? { items: maskParameters(items, secretNames, depth + 1) }
                  : {}),
              };
            })
          : redact(oneOf, new Set(), depth + 1);
      }
      return [name, parameter];
    })
  );
}

function redactAuthenticationCredential(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.map(item => redactAuthenticationCredential(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactAuthenticationCredential(item, depth + 1),
      ])
    );
  }
  if (value == null || value === '') return value;
  if (typeof value === 'string') {
    try {
      let hasReference = false;
      const literal = new Core.TemplateEngine().render(
        value,
        {},
        {
          lenient: true,
          onUnresolved: () => {
            hasReference = true;
          },
        }
      );
      if (hasReference && /^(?:Bearer|Basic|ApiKey|Token)?$/i.test(literal.trim())) return value;
    } catch {
      // Invalid draft templates can still contain literal credentials.
    }
  }
  return REDACTED;
}

export function redactMcpTelemetry(value: unknown): unknown {
  const parsed = connectorPayloadSchema.safeParse(value);
  if (!parsed.success) return redact(value, new Set());

  const { manifest, configuration, ...rest } = parsed.data;
  const parser = new Core.ManifestParser();
  const secretNames = new Set<string>(
    parser.getAuthenticationParameterNames(manifest.authentication)
  );
  const { parameters, authentication, ...manifestContent } = manifest;
  const maskedParameters = maskParameters(parameters, secretNames);
  const maskedManifest = {
    ...(redact(manifestContent, secretNames) as Record<string, unknown>),
    ...('authentication' in manifest
      ? {
          authentication: parser.mapAuthenticationCredentials(
            authentication,
            redactAuthenticationCredential,
            (metadata: unknown) => redact(metadata, new Set())
          ),
        }
      : {}),
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
