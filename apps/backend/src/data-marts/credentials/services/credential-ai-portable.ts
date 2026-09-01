import { BadRequestException } from '@nestjs/common';

const TYPE_MARKER = '$owoxCredentialPortableType';
const MAX_DEPTH = 40;

type PortableMarker =
  | { readonly [TYPE_MARKER]: 'bytes'; readonly value: string }
  | { readonly [TYPE_MARKER]: 'url'; readonly value: string }
  | { readonly [TYPE_MARKER]: 'date'; readonly value: string };

export function decodeCredentialAiOptions(
  value: unknown,
  abortSignal: AbortSignal
): Record<string, unknown> {
  const decoded = decodePortable(value, 0);
  if (!isPlainRecord(decoded)) {
    throw new BadRequestException('AI options must be an object');
  }

  // Network headers and provider-specific switches stay on the trusted backend side.
  const sanitized = stripProviderOptions(decoded, 0);
  delete sanitized.headers;
  delete sanitized.abortSignal;
  delete sanitized.providerOptions;
  sanitized.includeRawChunks = false;
  sanitized.abortSignal = abortSignal;
  return sanitized;
}

export function encodeCredentialAiValue(value: unknown): unknown {
  return encodePortable(value, 0, new WeakSet<object>());
}

export function sanitizeCredentialAiGenerateResult(value: {
  content: unknown;
  finishReason: unknown;
  usage: unknown;
  warnings: unknown;
}): unknown {
  return encodeCredentialAiValue({
    content: stripProviderOutput(value.content, 0),
    finishReason: value.finishReason,
    usage: stripRawUsage(value.usage),
    warnings: value.warnings,
  });
}

export function sanitizeCredentialAiEmbeddingResult(value: {
  embeddings: unknown;
  usage?: unknown;
  warnings: unknown;
}): unknown {
  return encodeCredentialAiValue({
    embeddings: value.embeddings,
    ...(value.usage === undefined ? {} : { usage: value.usage }),
    warnings: value.warnings,
  });
}

export function sanitizeCredentialAiStreamPart(value: unknown): unknown | null {
  if (!isPlainRecord(value)) return null;
  if (value.type === 'raw') return null;
  if (value.type === 'error') {
    return { type: 'error', error: { name: 'Error', message: 'AI provider request failed' } };
  }
  return encodeCredentialAiValue(stripProviderOutput(value, 0));
}

function decodePortable(value: unknown, depth: number): unknown {
  assertDepth(depth);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new BadRequestException('AI options contain an invalid number');
    return value;
  }
  if (Array.isArray(value)) return value.map(item => decodePortable(item, depth + 1));
  if (!isPlainRecord(value)) throw new BadRequestException('AI options are not portable');

  if (isPortableMarker(value)) {
    if (value[TYPE_MARKER] === 'bytes') return decodeBase64(value.value);
    if (value[TYPE_MARKER] === 'url') {
      try {
        return new URL(value.value);
      } catch {
        throw new BadRequestException('AI options contain an invalid URL');
      }
    }
    const date = new Date(value.value);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('AI options contain an invalid date');
    return date;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decodePortable(item, depth + 1)])
  );
}

function encodePortable(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  assertDepth(depth);
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Uint8Array) {
    return { [TYPE_MARKER]: 'bytes', value: Buffer.from(value).toString('base64') };
  }
  if (value instanceof URL) return { [TYPE_MARKER]: 'url', value: value.toString() };
  if (value instanceof Date) return { [TYPE_MARKER]: 'date', value: value.toISOString() };
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) throw new BadRequestException('AI value contains a cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => encodePortable(item, depth + 1, seen));
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== 'function' && typeof item !== 'symbol')
        .map(([key, item]) => [key, encodePortable(item, depth + 1, seen)])
        .filter(([, item]) => item !== undefined)
    );
  } finally {
    seen.delete(value);
  }
}

function stripProviderOptions(
  value: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  assertDepth(depth);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'providerOptions')
      .map(([key, item]) => [key, stripNestedProviderOptions(item, depth + 1)])
  );
}

function stripNestedProviderOptions(value: unknown, depth: number): unknown {
  assertDepth(depth);
  if (Array.isArray(value)) return value.map(item => stripNestedProviderOptions(item, depth + 1));
  if (!isPlainRecord(value)) return value;
  return stripProviderOptions(value, depth + 1);
}

function stripProviderOutput(value: unknown, depth: number): unknown {
  assertDepth(depth);
  if (Array.isArray(value)) return value.map(item => stripProviderOutput(item, depth + 1));
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'providerMetadata' && key !== 'providerOptions' && key !== 'raw')
      .map(([key, item]) => [key, stripProviderOutput(item, depth + 1)])
  );
}

function stripRawUsage(value: unknown): unknown {
  if (!isPlainRecord(value)) return value;
  const { raw: _raw, ...usage } = value;
  return usage;
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new BadRequestException('AI options contain invalid binary data');
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    throw new BadRequestException('AI options contain invalid binary data');
  }
  return new Uint8Array(buffer);
}

function isPortableMarker(value: Record<string, unknown>): value is PortableMarker {
  return (
    Object.keys(value).length === 2 &&
    typeof value.value === 'string' &&
    (value[TYPE_MARKER] === 'bytes' ||
      value[TYPE_MARKER] === 'url' ||
      value[TYPE_MARKER] === 'date')
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDepth(depth: number): void {
  if (depth > MAX_DEPTH) throw new BadRequestException('AI value is nested too deeply');
}
