import { Core } from '@owox/connectors';
import { z } from 'zod';
import { createSecretRedactor } from '../../../common/utils/secret-redaction';
import { credentialListItemSchema } from '../tools/credential/credential.schemas';

export const REDACT_KEYS =
  /(authorization|bearer|cookie|token|secret|password|passwd|api[_-]?key|private[_-]?key|credential(?![_-]?id$))/i;
export const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
// Deep enough for any real manifest: a cut subtree reads back as a value that save would store.
const MAX_DEPTH = 64;
const objectSchema = z.record(z.string(), z.unknown());
const connectorPayloadSchema = z.object({ manifest: objectSchema }).loose();
const credentialListSchema = z.array(credentialListItemSchema);

interface RedactionContext {
  connector: boolean;
  inferCredentialNames: boolean;
  /** Reads a manifest for its keys, not for logs: a named protocol value is not one. */
  keyCheck: boolean;
  secretNames: Set<string>;
  secretValues: Set<string>;
}

function isCredentialName(name: string): boolean {
  const normalized = name.replace(/[_\-\s]/g, '').toLowerCase();
  if (
    // `total_tokens` counts tokens; a key is one token.
    /(?:count|url|uri|path|type|name|hint|endpoint|ttl|tokens)$/.test(normalized) ||
    /^(?:next|previous)?(?:page|cursor|continuation|pagination)token$/.test(normalized)
  )
    return false;
  return REDACT_KEYS.test(name) || /(?:access|subscription|app|auth|secret)key/.test(normalized);
}

function isRequestCredentialName(name: string, inferCredentialNames: boolean): boolean {
  if (inferCredentialNames) return isCredentialName(name) || /^(?:key|auth|appid)$/i.test(name);
  const normalized = name.replace(/[_\-\s]/g, '').toLowerCase();
  return (
    /^(?:(?:x|proxy)?authorization|bearer|cookie|password|passwd|token|clientsecret|key|auth|appid)$/.test(
      normalized
    ) ||
    /(?:api|access|subscription|app|auth|secret|private)key$/.test(normalized) ||
    /(?:api|access|refresh|developer|personalaccess|auth|session|bearer|private)token$/.test(
      normalized
    )
  );
}

function isCredentialReference(value: string, keyCheck = false): boolean {
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
    return (
      hasReference &&
      (/^(?:Bearer|Basic|ApiKey|Token)?$/i.test(literal.trim()) ||
        // A key check reads a whole template: `sso-key {{ k }}:{{ s }}` holds no key; a key has digits.
        (keyCheck && /^[A-Za-z\s:="'-]*$/.test(literal)))
    );
  } catch {
    return false;
  }
}

function rememberSecret(value: unknown, context: RedactionContext, depth = 0): void {
  if (depth > MAX_DEPTH) return;
  if (typeof value === 'string' && value && !isCredentialReference(value, context.keyCheck)) {
    context.secretValues.add(value);
    const unprefixed = value.replace(/^(?:Bearer|Basic|ApiKey|Token)\s+/i, '');
    if (unprefixed) context.secretValues.add(unprefixed);
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    context.secretValues.add(String(value));
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) rememberSecret(item, context, depth + 1);
  }
}

const isPrimitive = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

function redactCredential(value: unknown, context: RedactionContext, depth = 0): unknown {
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) return value.map(item => redactCredential(item, context, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        // In a token exchange body, grant_type and scope are protocol and api_secret is a key.
        context.keyCheck &&
        (isPrimitive(item) || (Array.isArray(item) && item.every(isPrimitive))) &&
        !isRequestCredentialName(key, context.inferCredentialNames)
          ? item
          : redactCredential(item, context, depth + 1),
      ])
    );
  }
  if (typeof value === 'string' && value.includes('{{')) {
    try {
      new Core.TemplateEngine().render(
        value,
        {},
        {
          lenient: true,
          onUnresolved: (path: string) => {
            const [scope, name] = path.split('.');
            if (scope === 'parameters' && name) context.secretNames.add(name);
          },
        }
      );
    } catch {
      // Invalid templates are still masked as credential values.
    }
  }
  if (
    value == null ||
    value === '' ||
    (typeof value === 'string' && isCredentialReference(value, context.keyCheck))
  )
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
        if (!isRequestCredentialName(decodedName, context.inferCredentialNames)) return match;
        return `${separator}${name}=${redactCredential(decodedValue, context) === decodedValue ? value : REDACTED}`;
      }
    );
}

function redact(value: unknown, context: RedactionContext, depth = 0, container = ''): unknown {
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) return value.map(item => redact(item, context, depth + 1, container));
  if (typeof value === 'string') return redactUrlCredentials(value, context);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!context.connector && key === 'credentials') {
      const metadata = credentialListSchema.safeParse(item);
      if (metadata.success) {
        out[key] = redact(metadata.data, context, depth + 1, key);
        continue;
      }
    }
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
          ? ((context.inferCredentialNames || container === 'oauthParams') &&
              isCredentialName(key)) ||
            ((container === 'headers' || container === 'queryParameters') &&
              isRequestCredentialName(key, context.inferCredentialNames))
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
  if (depth > MAX_DEPTH) return TRUNCATED;
  const parsed = objectSchema.safeParse(value);
  if (!parsed.success) return redactCredential(value, context, depth);
  return Object.fromEntries(
    Object.entries(parsed.data).map(([name, raw]) => {
      if (context.inferCredentialNames && isCredentialName(name)) context.secretNames.add(name);
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
          if (fields[key] != null && fields[key] !== '') {
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
    ...('parameters' in manifest ? { parameters: maskParameters(parameters, context) } : {}),
  };
  return {
    ...(redact(rest, context) as Record<string, unknown>),
    manifest: maskedManifest,
    ...('configuration' in parsed.data ? { configuration: redact(configuration, context) } : {}),
  };
}

/** Derive secrets from request credentials, never from arbitrary provider fields. */
export function createMcpInputSecretRedactor(input: unknown): (value: unknown) => unknown {
  const context: RedactionContext = {
    connector: false,
    inferCredentialNames: false,
    keyCheck: false,
    secretNames: new Set(),
    secretValues: new Set(),
  };
  maskPayload(input, context);
  return createSecretRedactor(context.secretValues, {
    replacement: REDACTED,
    minimumSubstringLength: 4,
  });
}

function inputContext(): RedactionContext {
  return {
    connector: false,
    // The names that telemetry masks: X-Token and api_secret are keys, page_token is not.
    inferCredentialNames: true,
    keyCheck: true,
    secretNames: new Set(),
    secretValues: new Set(),
  };
}

/** Parameters that a connector input uses as keys: by SECRET, authentication or credential name. */
export function mcpSecretParameterNames(
  input: { manifest: Record<string, unknown>; configuration?: unknown },
  node: string
): ReadonlySet<string> {
  const context = inputContext();
  maskPayload(input, context);
  try {
    // The engine also keys clientId and a Basic username, which masking leaves visible. Parse only
    // the tested node, as the test does: another node of a draft can still be unfinished.
    const nodes = (input.manifest.nodes ?? {}) as Record<string, unknown>;
    const pruned = { ...input.manifest, nodes: { [node]: nodes[node] } };
    const model = new Core.ManifestParser().parse(JSON.stringify(pruned)) as {
      keyParameters?: string[];
    };
    for (const name of model.keyParameters ?? []) context.secretNames.add(name);
  } catch {
    // The test reports a manifest that the parser refuses.
  }
  return context.secretNames;
}

/** The manifest with each literal key replaced by [REDACTED]; parameter references stay. */
export function maskMcpManifestKeys(manifest: Record<string, unknown>): Record<string, unknown> {
  return (maskPayload({ manifest }, inputContext()) as { manifest: Record<string, unknown> })
    .manifest;
}

/** Paths of literal keys in a manifest, and of [REDACTED] values copied back from a read. */
export function mcpManifestKeyPaths(manifest: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const walk = (raw: unknown, masked: unknown, path: string): void => {
    if (raw && typeof raw === 'object' && masked && typeof masked === 'object') {
      for (const [key, item] of Object.entries(raw)) {
        walk(item, (masked as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
    } else if (
      raw !== masked ||
      (typeof raw === 'string' && (raw.includes(REDACTED) || raw.includes(TRUNCATED)))
    ) {
      paths.push(path);
    }
  };
  walk(manifest, maskMcpManifestKeys(manifest), '');
  return paths;
}

export function redactMcpTelemetry(value: unknown, input?: unknown): unknown {
  const context: RedactionContext = {
    connector: false,
    inferCredentialNames: true,
    keyCheck: false,
    secretNames: new Set(),
    secretValues: new Set(),
  };
  if (input !== undefined && input !== value) maskPayload(input, context);
  const masked = maskPayload(value, context);
  if (context.secretValues.size === 0) return masked;
  return createSecretRedactor(context.secretValues, {
    replacement: REDACTED,
    minimumSubstringLength: 4,
  })(masked);
}
