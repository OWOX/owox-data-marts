interface InferredField {
  type: string;
  dataPath?: string;
}

// Deep enough for the metrics and settings objects APIs nest, shallow enough that the proposed
// column names stay readable. An object nested deeper is proposed as one JSON column.
const MAX_PATH_SEGMENTS = 4;

/**
 * Infers a manifest field map from a single sample record. Each value becomes a field, the
 * values inside a nested object included, named after its path (`stats.clicks` becomes
 * `stats_clicks`). A field's name becomes a column name, which the parser limits to letters,
 * digits and underscores, so a field whose name differs from its path reads the value back
 * through `dataPath`; otherwise there is no `dataPath` and FieldCaster falls back to the field
 * name. Arrays stay one field each. Used by the "Discover fields from sample" builder action.
 */
export function inferFieldsFromSample(
  record: Record<string, unknown> | null | undefined
): Record<string, InferredField> {
  if (!isPlainObject(record)) return {};
  const out: Record<string, InferredField> = {};
  const add = (path: string[], value: unknown) => {
    const dataPath = path.join('.');
    const name = uniqueName(fieldName(path.join('_')), out);
    out[name] =
      name === dataPath ? { type: inferType(value) } : { type: inferType(value), dataPath };
  };
  const walk = (value: Record<string, unknown>, path: string[]) => {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (canDescend(child, childPath)) walk(child, childPath);
      else add(childPath, child);
    }
  };
  walk(record, []);
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A data path is split on dots, so nothing below a key that holds one can be addressed.
function canDescend(value: unknown, path: string[]): value is Record<string, unknown> {
  if (!isPlainObject(value) || path.length >= MAX_PATH_SEGMENTS) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && [...path, ...keys].every(key => !key.includes('.'));
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
  return 'string';
}
