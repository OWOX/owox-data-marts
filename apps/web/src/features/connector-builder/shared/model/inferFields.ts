/**
 * Infers a manifest field map from a single sample record's top-level keys.
 * Each field is named after its key with no `dataPath` (FieldCaster falls back
 * to the field name). Used by the "Discover fields from sample" builder action.
 */
export function inferFieldsFromSample(
  record: Record<string, unknown> | null | undefined
): Record<string, { type: string }> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const out: Record<string, { type: string }> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = { type: inferType(value) };
  }
  return out;
}

function inferType(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value !== null && typeof value === 'object') return 'string';
  return 'string';
}
