function prepareObjectRec(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => prepareObjectRec(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === 'status' || key === 'alias') {
        continue;
      }

      result[key] = prepareObjectRec(nestedValue);
    }

    const obj = value as Record<string, unknown>;
    if (typeof obj.alias === 'string' && obj.alias.trim() !== '') {
      result.businessName = obj.alias.trim();
    }

    const calculated = result.calculated;
    if (calculated !== null && typeof calculated === 'object' && !Array.isArray(calculated)) {
      const { formula: _formula, ...rest } = calculated as Record<string, unknown>;
      result.calculated = rest;
    }

    return result;
  }

  return value;
}

/**
 * Removes schema field `status` and `alias` noise, and a calculated field's stored `formula`, from
 * prompt payloads before sending them to LLM. Adds `businessName` from `alias` if present.
 * Keeps domain models unchanged and affects only serialized prompt context.
 */
export function prepareSchema<T>(value: T): T {
  return prepareObjectRec(value) as T;
}
