import { createHash } from 'node:crypto';

export function createConnectorSourceFingerprint(source: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortObjectKeys(source)))
    .digest('hex');
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        result[key] = sortObjectKeys(child);
      }
      return result;
    }, {});
}
