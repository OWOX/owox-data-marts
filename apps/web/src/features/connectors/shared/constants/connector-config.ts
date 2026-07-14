/**
 * Config field name a connector uses to select its reporting grain, when its
 * unique-key fields vary by that value (see `uniqueKeysByDataLevel` in
 * `ConnectorFieldsResponseApiDto`). Not tied to a specific connector — any connector
 * following this convention gets the same field-pinning behavior for free.
 */
export const DATA_LEVEL_CONFIG_KEY = 'DataLevel' as const;
