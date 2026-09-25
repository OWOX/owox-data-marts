/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Resolves a list of string values from one of three shapes, shared by the list
 * partition router and the RecordFilter `inList` operator:
 *  - `values`: a literal array -> stringified as-is
 *  - `valuesFromParameter`: a parameter name -> its scope value, comma-split
 *  - `value`: a literal comma-string -> comma-split
 * Split sources are trimmed and have empty entries dropped. Missing source -> [].
 */
export function resolveValueList(spec, scope) {
  if (spec && Array.isArray(spec.values)) {
    return spec.values.map(v => String(v));
  }
  let raw;
  if (spec && spec.valuesFromParameter) {
    raw = scope?.parameters?.[spec.valuesFromParameter];
  } else if (spec && spec.value !== undefined) {
    raw = spec.value;
  }
  if (raw == null) return [];
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
