// Imported by migration 1793000000000: keep it and its imports free of Nest and runtime services.
import type { CustomConnectorKeyModel } from './custom-connector-credential-fit';
import { sourceBindingsFor } from './source-credential-definitions';

/** The parameters at `path` of a configuration that one of the connector's Credentials fills. */
export interface SourceKeyFields {
  readonly path: readonly string[];
  readonly parameters: readonly string[];
}

export interface SourceKeys {
  /** Empty for a connector that needs no key. */
  readonly fields: readonly SourceKeyFields[];
  /** A custom connector's manifest as the fit rule reads it; null for a bundled connector. */
  readonly model: CustomConnectorKeyModel | null;
}

type Config = Record<string, unknown>;

const OLD_KEY_REFERENCES = new Set(['_secrets_id', '_source_credential_id']);

/** Secret entry of a converted Credential: the old row's rotated token as last taken; never injected. */
export const OLD_ROW_TOKEN_FIELD = 'legacy_generated_refresh_token';

/** A configuration id as the binding index compares it: utf8mb4_0900_ai_ci folds case, accents and width. */
export function bindingIdKey(id: string): string {
  return id.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function bundledSourceKeyFields(connectorName: string): SourceKeyFields[] {
  return sourceBindingsFor(connectorName).map(({ path, fieldMap }) => ({
    path,
    parameters: Object.values(fieldMap),
  }));
}

/** The configuration's key values by dotted path, like `AuthType.oauth2.ClientId`; empty ones left out. */
export function keyValuesOf(
  config: Config,
  fields: readonly SourceKeyFields[]
): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  for (const { path, parameters } of fields) {
    const values = objectAt(config, path);
    for (const name of parameters) {
      const value = values?.[name];
      if (value !== undefined && value !== null && value !== '') {
        found[[...path, name].join('.')] = value;
      }
    }
  }
  return found;
}

export function withoutKeyValues(config: Config, fields: readonly SourceKeyFields[]): Config {
  const copy = structuredClone(config);
  for (const { path, parameters } of fields) {
    const values = objectAt(copy, path);
    for (const name of parameters) delete values?.[name];
  }
  return copy;
}

/** The `_secrets_id` and `_source_credential_id` values anywhere in the configuration. */
export function oldKeyIdsOf(config: unknown): string[] {
  if (!isRecord(config)) return [];
  return Object.entries(config).flatMap(([key, value]) =>
    OLD_KEY_REFERENCES.has(key) ? (typeof value === 'string' ? [value] : []) : oldKeyIdsOf(value)
  );
}

export function withoutOldKeys(config: Config): Config {
  return JSON.parse(
    JSON.stringify(config, (key, value: unknown) =>
      OLD_KEY_REFERENCES.has(key) ? undefined : value
    )
  ) as Config;
}

/** The configuration with the old key references `previous` holds, where it holds them. */
export function withOldKeysOf(config: Config, previous: unknown): Config {
  if (!isRecord(previous)) return config;
  const result = { ...config };
  for (const [key, value] of Object.entries(previous)) {
    if (OLD_KEY_REFERENCES.has(key)) {
      result[key] = value;
    } else if (isRecord(value) && isRecord(result[key])) {
      // Only where the configuration still holds the parent: a dropped auth variant stays dropped.
      result[key] = withOldKeysOf(result[key], value);
    }
  }
  return result;
}

function objectAt(config: Config, path: readonly string[]): Config | undefined {
  let current: unknown = config;
  for (const key of path) current = isRecord(current) ? current[key] : undefined;
  return isRecord(current) ? current : undefined;
}

function isRecord(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
