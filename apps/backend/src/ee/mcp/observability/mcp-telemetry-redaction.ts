import { Core } from '@owox/connectors';
import { z } from 'zod-v4';

export const REDACT_KEYS =
  /(authorization|bearer|cookie|token|secret|password|passwd|api[_-]?key|private[_-]?key|credential)/i;
export const REDACTED = '[REDACTED]';
const MAX_DEPTH = 16;
const objectSchema = z.record(z.string(), z.unknown());
const connectorPayloadSchema = z.object({ manifest: objectSchema }).loose();

interface RedactionContext {
  connector: boolean;
  secretNames: Set<string>;
  secretValues: Set<string>;
}

function isCredentialName(name: string): boolean {
  const normalized = name.replace(/[_\-\s]/g, '').toLowerCase();
  if (
    /(?:count|url|uri|path|type|name|hint|endpoint|ttl)$/.test(normalized) ||
    /^(?:next|previous)?(?:page|cursor|continuation|pagination)token$/.test(normalized)
  )
    return false;
  return REDACT_KEYS.test(name) || /(?:access|subscription|app|auth|secret)key/.test(normalized);
}

function isRequestCredentialName(name: string): boolean {
  return isCredentialName(name) || /^(?:key|auth|appid)$/i.test(name);
}

function isCredentialReference(value: string): boolean {
  if (!value.includes('{{')) return false;
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
    return hasReference && /^(?:Bearer|Basic|ApiKey|Token)?$/i.test(literal.trim());
  } catch {
    return false;
  }
}

function rememberSecret(value: unknown, context: RedactionContext, depth = 0): void {
  if (depth > MAX_DEPTH) return;
  if (typeof value === 'string' && value && !isCredentialReference(value)) {
    context.secretValues.add(value);
    const unprefixed = value.replace(/^(?:Bearer|Basic|ApiKey|Token)\s+/i, '');
    if (unprefixed) context.secretValues.add(unprefixed);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) rememberSecret(item, context, depth + 1);
  }
}

function redactCredential(value: unknown, context: RedactionContext, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map(item => redactCredential(item, context, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactCredential(item, context, depth + 1)])
    );
  }
  if (value == null || value === '' || (typeof value === 'string' && isCredentialReference(value)))
    return value;
  rememberSecret(value, context);
  return REDACTED;
}

function redactUrlCredentials(text: string, context: RedactionContext): string {
  return text
    .replace(/(https?:\/\/)([^/\s@?#]+)@/gi, (_match, scheme: string, credentials: string) => {
      rememberSecret(credentials, context);
      const password = credentials.slice(credentials.indexOf(':') + 1);
      rememberSecret(password, context);
      try {
        rememberSecret(decodeURIComponent(password), context);
      } catch {
        /* unfinished URL */
      }
      return `${scheme}${REDACTED}@`;
    })
    .replace(
      /([?&])([^=?&#\s"'<>]+)=((?:\{\{[^{}]*\}\}|[^&#\s"'<>])*)/g,
      (match, separator: string, name: string, value: string) => {
        let decodedName = name;
        let decodedValue = value;
        try {
          decodedName = decodeURIComponent(name);
          decodedValue = decodeURIComponent(value);
        } catch {
          /* unfinished URL */
        }
        if (!isRequestCredentialName(decodedName)) return match;
        return `${separator}${name}=${redactCredential(decodedValue, context) === decodedValue ? value : REDACTED}`;
      }
    );
}

function redact(value: unknown, context: RedactionContext, depth = 0, container = ''): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map(item => redact(item, context, depth + 1, container));
  if (typeof value === 'string') return redactUrlCredentials(value, context);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (context.connector && container === 'oauthParams' && key === 'vars') {
      out[key] = maskParameters(item, context, depth + 1);
      continue;
    }
    const schemaName = context.connector && (container === 'fields' || container === 'nodes');
    const namedSecret = container !== 'parameterDefinition' && context.secretNames.has(key);
    const credential =
      !schemaName &&
      (namedSecret ||
        (context.connector
          ? isCredentialName(key) ||
            ((container === 'headers' || container === 'queryParameters') &&
              isRequestCredentialName(key))
          : REDACT_KEYS.test(key)));
    if (credential) {
      rememberSecret(item, context);
      out[key] = context.connector ? redactCredential(item, context, depth + 1) : REDACTED;
    } else {
      out[key] = redact(item, context, depth + 1, key);
    }
  }
  return out;
}

function maskParameters(value: unknown, context: RedactionContext, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  const parsed = objectSchema.safeParse(value);
  if (!parsed.success) return redactCredential(value, context, depth);
  return Object.fromEntries(
    Object.entries(parsed.data).map(([name, raw]) => {
      if (isCredentialName(name)) context.secretNames.add(name);
      const definition = objectSchema.safeParse(raw);
      if (!definition.success) {
        if (context.secretNames.has(name)) {
          rememberSecret(raw, context);
          return [name, REDACTED];
        }
        return [name, redact(raw, context, depth + 1)];
      }
      const { oneOf, ...fields } = definition.data;
      const parameter = redact(fields, context, depth + 1, 'parameterDefinition') as Record<
        string,
        unknown
      >;
      if (
        context.secretNames.has(name) ||
        (Array.isArray(fields.attributes) && fields.attributes.includes('SECRET'))
      ) {
        context.secretNames.add(name);
        for (const key of ['default', 'placeholder', 'options', 'value']) {
          if (key in fields) {
            rememberSecret(fields[key], context);
            parameter[key] = REDACTED;
          }
        }
      }
      if ('oneOf' in definition.data) {
        parameter.oneOf = Array.isArray(oneOf)
          ? oneOf.map(rawOption => {
              const option = objectSchema.safeParse(rawOption);
              if (!option.success) return redactCredential(rawOption, context, depth + 1);
              const { items, ...metadata } = option.data;
              return {
                ...(redact(metadata, context, depth + 1) as Record<string, unknown>),
                ...('items' in option.data
                  ? { items: maskParameters(items, context, depth + 1) }
                  : {}),
              };
            })
          : redactCredential(oneOf, context, depth + 1);
      }
      return [name, parameter];
    })
  );
}

function maskPayload(value: unknown, context: RedactionContext): unknown {
  const parsed = connectorPayloadSchema.safeParse(value);
  if (!parsed.success) return redact(value, context);
  context.connector = true;
  const { manifest, configuration, ...rest } = parsed.data;
  const parser = new Core.ManifestParser();
  for (const name of parser.getAuthenticationParameterNames(manifest.authentication))
    context.secretNames.add(name);
  const { parameters, authentication, ...manifestContent } = manifest;
  const maskedParameters = maskParameters(parameters, context);
  const maskedManifest = {
    ...(redact(manifestContent, context) as Record<string, unknown>),
    ...('authentication' in manifest
      ? {
          authentication: parser.mapAuthenticationCredentials(
            authentication,
            (credential: unknown) => redactCredential(credential, context),
            (metadata: unknown) => redact(metadata, context)
          ),
        }
      : {}),
    ...('parameters' in manifest ? { parameters: maskedParameters } : {}),
  };
  return {
    ...(redact(rest, context) as Record<string, unknown>),
    manifest: maskedManifest,
    ...('configuration' in parsed.data ? { configuration: redact(configuration, context) } : {}),
  };
}

function replaceKnownSecrets(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    if (isCredentialReference(value)) return value;
    let result = value;
    for (const secret of secrets) {
      if (result === secret) return REDACTED;
      // Short values are masked at credential positions, not inside ordinary words.
      if (secret.length >= 4) result = result.split(secret).join(REDACTED);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(item => replaceKnownSecrets(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceKnownSecrets(item, secrets)])
    );
  }
  return value;
}

export function redactMcpTelemetry(value: unknown, input?: unknown): unknown {
  const context: RedactionContext = {
    connector: false,
    secretNames: new Set(),
    secretValues: new Set(),
  };
  if (input !== undefined && input !== value) maskPayload(input, context);
  const masked = maskPayload(value, context);
  if (context.secretValues.size === 0) return masked;
  const forms = new Set<string>();
  for (const secret of context.secretValues) {
    forms.add(secret);
    forms.add(JSON.stringify(secret).slice(1, -1));
    try {
      forms.add(encodeURIComponent(secret));
    } catch {
      /* JSON drafts can contain unpaired Unicode surrogates. */
    }
  }
  return replaceKnownSecrets(
    masked,
    [...forms].sort((a, b) => b.length - a.length)
  );
}
