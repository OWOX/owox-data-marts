import { createHash } from 'node:crypto';

interface DataQualityConfigRevisionInput {
  effectiveConfig: unknown;
  schema: unknown;
  relationships: readonly unknown[];
}

export function createDataQualityConfigRevision(input: DataQualityConfigRevisionInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize((value as Record<string, unknown>)[key])])
  );
}
