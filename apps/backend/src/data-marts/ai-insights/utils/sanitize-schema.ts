function removeStatusRec(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => removeStatusRec(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === 'status') {
        continue;
      }

      result[key] = removeStatusRec(nestedValue);
    }

    return result;
  }

  return value;
}

/**
 * Removes schema field `status` noise from prompt payloads before sending them to LLM.
 * Keeps domain models unchanged and affects only serialized prompt context.
 */
export function sanitizeSchema<T>(value: T): T {
  return removeStatusRec(value) as T;
}
