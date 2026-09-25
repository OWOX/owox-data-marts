/**
 * Infers a manifest field map from a single sample record's top-level keys.
 * Each field is named after its key. A field's name becomes a column name, which the parser
 * limits to letters, digits and underscores, so a key outside that is renamed and read back
 * through `dataPath`; otherwise there is no `dataPath` and FieldCaster falls back to the field
 * name. Used by the "Discover fields from sample" builder action.
 */
export function inferFieldsFromSample(
  record: Record<string, unknown> | null | undefined
): Record<string, { type: string; dataPath?: string }> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const out: Record<string, { type: string; dataPath?: string }> = {};
  for (const [key, value] of Object.entries(record)) {
    const name = uniqueName(fieldName(key), out);
    out[name] =
      name === key ? { type: inferType(value) } : { type: inferType(value), dataPath: key };
  }
  return out;
}

function fieldName(key: string): string {
  const name = key.replace(/[^A-Za-z0-9_]/g, '_');
  if (name === '') return 'field';
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

function uniqueName(name: string, taken: Record<string, unknown>): string {
  if (!(name in taken)) return name;
  let suffix = 2;
  while (`${name}_${String(suffix)}` in taken) suffix += 1;
  return `${name}_${String(suffix)}`;
}

function inferType(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value !== null && typeof value === 'object') return 'string';
  return 'string';
}
