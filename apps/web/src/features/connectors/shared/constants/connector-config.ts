/**
 * Config field name a connector uses to select its reporting grain, when its
 * unique-key fields vary by that value (see `uniqueKeysByDataLevel` in
 * `ConnectorFieldsResponseApiDto`). Not tied to a specific connector — any connector
 * following this convention gets the same field-pinning behavior for free.
 */
export const DATA_LEVEL_CONFIG_KEY = 'DataLevel' as const;

/**
 * Resolve the Data Level the connector will actually run with. The config form does not
 * push an unchanged spec default into the configuration object, so when the user leaves
 * Data Level at its default it is absent from `configuration` — yet the connector still
 * defaults to it at runtime. Fall back to the spec default so field reconciliation targets
 * the same level the run will use. Returns undefined when no string data level applies.
 */
export function resolveEffectiveDataLevel(
  configuration: Record<string, unknown>,
  specification: readonly { name: string; default?: unknown }[] | null | undefined
): string | undefined {
  const configured = configuration[DATA_LEVEL_CONFIG_KEY];
  if (typeof configured === 'string') return configured;

  const specDefault = specification?.find(spec => spec.name === DATA_LEVEL_CONFIG_KEY)?.default;
  return typeof specDefault === 'string' ? specDefault : undefined;
}
