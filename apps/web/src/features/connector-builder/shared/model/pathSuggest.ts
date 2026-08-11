function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Flatten a sample record into dot-paths for field-path autocomplete. Recurses
 * into plain objects (`a`, `a.b`, `a.b.c`); for arrays, emits the array key only
 * (no indices, no element fields). Depth- and count-capped for safety.
 */
export function flattenPaths(
  record: unknown,
  opts: { maxDepth?: number; maxCount?: number } = {}
): string[] {
  const maxDepth = opts.maxDepth ?? 5;
  const maxCount = opts.maxCount ?? 200;
  const out: string[] = [];
  const seen = new Set<string>();

  const walk = (value: unknown, prefix: string, depth: number): void => {
    if (out.length >= maxCount || !isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
      if (out.length >= maxCount) return;
      const path = prefix ? `${prefix}.${key}` : key;
      if (!seen.has(path)) {
        seen.add(path);
        out.push(path);
      }
      const child = value[key];
      if (isPlainObject(child) && depth < maxDepth) {
        walk(child, path, depth + 1);
      }
    }
  };

  walk(record, '', 1);
  return out;
}
