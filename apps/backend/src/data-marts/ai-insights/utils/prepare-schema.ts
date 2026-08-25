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

    // A calculated field's stored `formula` is internal storage spelling — dialect SQL with
    // `{{ref …}}` Handlebars tags — and it must not reach a model's context. It is not usable SQL
    // (an agent copying it into a query emits a literal tag), it is not a field the agent can
    // reference, and on the MCP path it is pure noise in every get_data_mart_details response.
    // What the agent DOES need survives: that the field is a calculated metric (`calculated` stays
    // present, which is what makes the tool publish an empty allowedAggregations set for it), plus
    // its name, type and description like any other field. Unknown future keys are kept, so a
    // later slice's addition is not silently dropped here.
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
