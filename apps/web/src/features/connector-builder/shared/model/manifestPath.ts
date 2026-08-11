const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getAtPath(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

export function setAtPath<T extends object>(
  // Callers reach here with an undefined branch while building a nested path,
  // so the parameter admits it rather than relying on the `?? {}` below alone.
  obj: T | undefined,
  path: (string | number)[],
  value: unknown
): T {
  if (path.length === 0) return value as T;
  for (const key of path) {
    if (UNSAFE_KEYS.has(String(key))) {
      throw new Error(`setAtPath: unsafe key "${String(key)}"`);
    }
  }
  const [head, ...rest] = path;
  const source = (obj ?? {}) as Record<string | number, unknown>;
  const existing = source[head];
  const base = existing != null && typeof existing === 'object' ? existing : {};
  const child = rest.length === 0 ? value : setAtPath(base, rest, value);
  return { ...source, [head]: child } as T;
}
