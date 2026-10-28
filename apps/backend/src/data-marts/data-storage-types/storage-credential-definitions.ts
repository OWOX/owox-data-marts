import { isDeepStrictEqual } from 'node:util';
import type { ZodTypeAny } from 'zod';
import type { StoredStorageCredentials } from '../entities/stored-storage-credentials.type';
import type { CredentialPublicMetadata, CredentialSecret } from '../credentials/credential.types';
import { secretValue } from '../credentials/credential.types';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../credentials/services/builtin-credential-definitions';
import { AthenaConfigSchema } from './athena/schemas/athena-config.schema';
import { BigQueryConfigSchema } from './bigquery/schemas/bigquery-config.schema';
import type { DataStorageConfig } from './data-storage-config.type';
import { DatabricksWorkspaceConfigSchema } from './databricks/schemas/databricks-config.schema';
import { RedshiftConfigSchema } from './redshift/schemas/redshift-config.schema';
import { SnowflakeConfigSchema } from './snowflake/schemas/snowflake-config.schema';
import { DataStorageType } from './enums/data-storage-type.enum';
import { ValidationResult } from './interfaces/data-storage-access-validator.interface';
import { SnowflakeAuthMethod } from './snowflake/enums/snowflake-auth-method.enum';
import { DatabricksAuthMethod } from './databricks/enums/databricks-auth-method.enum';

const BIGQUERY = ['google-service-account', 'google-oauth'] as const;

export const STORAGE_CREDENTIAL_DEFINITION_IDS: Readonly<
  Record<DataStorageType, readonly string[]>
> = {
  [DataStorageType.GOOGLE_BIGQUERY]: BIGQUERY,
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: BIGQUERY,
  [DataStorageType.AWS_ATHENA]: ['aws-access-key'],
  [DataStorageType.AWS_REDSHIFT]: ['aws-access-key'],
  [DataStorageType.SNOWFLAKE]: ['snowflake-password', 'snowflake-key-pair'],
  [DataStorageType.DATABRICKS]: ['databricks-token'],
};

/** Fields that set where a Storage's key is sent, or the project or account it acts in. */
const CONNECTION_TARGET_FIELDS: Readonly<Record<DataStorageType, readonly string[]>> = {
  [DataStorageType.GOOGLE_BIGQUERY]: ['projectId'],
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: ['projectId'],
  [DataStorageType.AWS_ATHENA]: ['region'],
  [DataStorageType.AWS_REDSHIFT]: [
    'connectionType',
    'region',
    'clusterIdentifier',
    'workgroupName',
  ],
  [DataStorageType.SNOWFLAKE]: ['account'],
  [DataStorageType.DATABRICKS]: ['host'],
};

const CONFIG_SCHEMAS: Readonly<Record<DataStorageType, ZodTypeAny>> = {
  [DataStorageType.GOOGLE_BIGQUERY]: BigQueryConfigSchema,
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: BigQueryConfigSchema,
  [DataStorageType.AWS_ATHENA]: AthenaConfigSchema,
  [DataStorageType.AWS_REDSHIFT]: RedshiftConfigSchema,
  [DataStorageType.SNOWFLAKE]: SnowflakeConfigSchema,
  [DataStorageType.DATABRICKS]: DatabricksWorkspaceConfigSchema,
};

type MaybeConfig = DataStorageConfig | null | undefined;

/** Both configs parsed (defaults applied, unknown keys dropped), or both as sent if either fails. */
function comparable(type: DataStorageType, before: MaybeConfig, after: MaybeConfig) {
  const parsedBefore = CONFIG_SCHEMAS[type].safeParse(before);
  const parsedAfter = CONFIG_SCHEMAS[type].safeParse(after);
  return parsedBefore.success && parsedAfter.success
    ? ([parsedBefore.data, parsedAfter.data] as const)
    : ([before, after] as const);
}

export function changesConnectionTarget(
  type: DataStorageType,
  before: MaybeConfig,
  after: MaybeConfig
): boolean {
  const [from, to] = comparable(type, before, after);
  const field = (config: unknown, key: string) =>
    (config as Record<string, unknown> | null | undefined)?.[key];
  return CONNECTION_TARGET_FIELDS[type].some(key => field(from, key) !== field(to, key));
}

export function sameStorageConfig(
  type: DataStorageType,
  before: MaybeConfig,
  after: MaybeConfig
): boolean {
  return isDeepStrictEqual(...comparable(type, before, after));
}

/** The config as sent without the keys its type's schema drops; as it is when it does not parse. */
export function storableStorageConfig(
  type: DataStorageType,
  config: DataStorageConfig
): DataStorageConfig {
  const parsed = CONFIG_SCHEMAS[type].safeParse(config);
  if (!parsed.success) return config;
  const kept = parsed.data as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => Object.hasOwn(kept, key))
  ) as DataStorageConfig;
}

/** The validators' own result for a config the type's schema refuses, or null when it fits. */
export function invalidStorageConfig(
  type: DataStorageType,
  config: MaybeConfig
): ValidationResult | null {
  const parsed = CONFIG_SCHEMAS[type].safeParse(config);
  return parsed.success ? null : ValidationResult.invalidInput('config', parsed.error);
}

/** Adapter key that carries the fixed discriminator the stored shape needs for a definition. */
const ADAPTER_PREFIX: Record<string, Record<string, string>> = {
  'snowflake-password': { authMethod: SnowflakeAuthMethod.PASSWORD },
  'snowflake-key-pair': { authMethod: SnowflakeAuthMethod.KEY_PAIR },
  'databricks-token': { authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN },
};

const FIELD_DEFINITIONS = new Map(
  BUILTIN_CREDENTIAL_DEFINITIONS.flatMap(definition =>
    definition.auth.type === 'fields' ? [[definition.id, definition.auth.fields] as const] : []
  )
);

/** The fields of a definition that has an adapter shape. */
export function adapterFieldsOf(definitionId: string) {
  const fields = FIELD_DEFINITIONS.get(definitionId);
  if (!fields) throw new Error(`Credential definition "${definitionId}" has no adapter shape`);
  return fields;
}

export function toAdapterCredentials(
  definitionId: string,
  secret: CredentialSecret,
  metadata: CredentialPublicMetadata | null
): StoredStorageCredentials {
  if (definitionId === 'google-oauth') {
    throw new Error('Google OAuth credentials have no adapter shape');
  }
  if (definitionId === 'google-service-account') {
    return JSON.parse(secretValue(secret)) as StoredStorageCredentials;
  }
  const secrets = 'fields' in secret ? secret.fields : {};
  const publics = metadata && 'fields' in metadata ? metadata.fields : {};
  // Both halves, so a value stays readable after its field's secret flag changes.
  const values: Record<string, string> = { ...publics, ...secrets };
  const result: Record<string, string> = { ...ADAPTER_PREFIX[definitionId] };
  for (const field of adapterFieldsOf(definitionId)) {
    const value = values[field.key];
    if (value !== undefined) result[field.key] = value;
  }
  return result as unknown as StoredStorageCredentials;
}
