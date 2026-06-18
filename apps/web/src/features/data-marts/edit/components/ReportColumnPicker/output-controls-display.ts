/** Last dotted segment of a flattened field name: `a.b.c` → `c`. */
export function fieldLeafName(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? name : name.slice(i + 1);
}

/**
 * Business-readable label for a field option. Prefers a human-set alias;
 * otherwise the leaf of `basis` — the dotted path for native fields, or the
 * already-leaf original field name for blended fields.
 */
export function fieldDisplayLabel(alias: string | undefined, basis: string): string {
  const trimmed = alias?.trim() ?? '';
  return trimmed !== '' ? trimmed : fieldLeafName(basis);
}
