/**
 * Text form of an untyped value for display.
 *
 * Manifest parameter defaults and connector log fields are `unknown`: a connector
 * author can put an object or an array there. `String()` would render those as the
 * useless "[object Object]", so anything non-primitive is JSON-serialised instead.
 */
/**
 * First value that is a present, non-empty string.
 *
 * Stands in for `a || b` on display strings, where an empty string has to fall
 * through exactly like an absent one — which `??` would not do. Pass a literal
 * as the last argument to guarantee a result.
 */
export function firstNonEmpty(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

export function asText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // A function or symbol has no useful text form; only objects/arrays reach JSON.
  if (typeof value === 'function' || typeof value === 'symbol') return fallback;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}
