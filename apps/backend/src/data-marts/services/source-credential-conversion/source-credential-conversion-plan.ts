// Imported by migration 1793000000000: keep it and its imports free of Nest and runtime services.
import { Core } from '@owox/connectors';
import { z } from 'zod';
import {
  fitCustomConnectorCredential,
  type CustomConnectorKeyModel,
  selectedKeyParameters,
} from '../../connector-types/custom-connector-credential-fit';
import {
  CUSTOM_CONNECTOR_DEFINITION_ID,
  bundledSourceConnectors,
  sourceBindingsFor,
  sourceCredentialDefinitions,
  sourceDefinitionIdsFor,
  type ConnectorSpecSource,
  type SourceCredentialBinding,
} from '../../connector-types/source-credential-definitions';
import {
  OLD_ROW_TOKEN_FIELD,
  bindingIdKey,
  oldKeyIdsOf,
} from '../../connector-types/source-key-fields';
import {
  UNKNOWN_ACCOUNT_ID,
  type CredentialPublicMetadata,
  type CredentialSecret,
  type CustomConnectorFieldSpec,
  type SourceConnection,
} from '../../credentials/credential.types';
import { materialKey } from '../../credentials/services/credential-material-key';
import { readGoogleServiceAccountKey } from '../../credentials/services/google-service-account-key-reader';
import { groupConversionItems, parsedJson } from '../storage-credential-conversion/grouping';

const {
  CONFIG_ATTRIBUTES,
  GENERATED_REFRESH_TOKEN_CONFIG_FIELD,
  GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD,
} = Core;

const NO_SELECTION = 'the configuration selects no authentication';

/** `credential_consumer_binding.requirementKey` is varchar(255); MySQL counts characters, not UTF-16 units. */
const REQUIREMENT_KEY_LENGTH = 255;

// With `AuthType.oauth2` selected, only these getters fall back to a deprecated parameter: LinkedInAds and LinkedInPages `_getClient*`/`_getRefreshToken`, MicrosoftAds `getAccessToken`.
const DEPRECATED_READ_WITH_VARIANT: Readonly<Record<string, readonly string[]>> = {
  LinkedInAds: ['ClientID', 'ClientSecret', 'RefreshToken'],
  LinkedInPages: ['ClientID', 'ClientSecret', 'RefreshToken'],
  MicrosoftAds: ['ClientID', 'ClientSecret', 'RefreshToken'],
};

type Config = Record<string, unknown>;

/** A `connector_source_credentials` row as the migration reads it: JSON may still be text. */
export interface OldSourceKeyRow {
  readonly projectId: string;
  readonly connectorName: string;
  /** Who connected a project-level OAuth row. */
  readonly userId: string | null;
  readonly credentials: unknown;
  readonly user: unknown;
  readonly expiresAt: Date | null;
}

/** A configuration of a live connector Data Mart with no binding row, as the migration reads it. */
export interface UnconvertedSourceConfig {
  readonly dataMartId: string;
  readonly projectId: string;
  readonly dataMartTitle: string;
  readonly createdAt: Date;
  readonly technicalOwnerIds: readonly string[];
  readonly businessOwnerIds: readonly string[];
  readonly contextIds: readonly string[];
  readonly connectorName: string;
  /** The configuration item as stored, `_id` and old key references included. */
  readonly config: Readonly<Config>;
  /** A custom connector's title and the manifest of the version the Data Mart runs, null when none is published; absent for any other name. */
  readonly custom?: { readonly title: string; readonly manifest: unknown } | null;
}

export interface SourceConversionOptions {
  /** Live old key rows by id. */
  readonly oldRows: ReadonlyMap<string, OldSourceKeyRow>;
  /** Live Credentials by id, for a `_source_credential_id` that already names one. */
  readonly credentials: ReadonlyMap<
    string,
    { readonly projectId: string; readonly definitionId: string }
  >;
}

export interface SourceConfigRef {
  readonly dataMartId: string;
  readonly configId: string;
}

export interface PlannedSourceCredential {
  readonly projectId: string;
  readonly definitionId: string;
  readonly title: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  readonly ownerIds: readonly string[];
  readonly contextIds: readonly string[];
  readonly bindings: readonly SourceConfigRef[];
}

export interface SourceConversionPlan {
  readonly credentials: readonly PlannedSourceCredential[];
  /** Configurations whose `_source_credential_id` already names a Credential of their connector. */
  readonly bindings: readonly (SourceConfigRef & {
    readonly projectId: string;
    readonly credentialId: string;
  })[];
  /** A skipped configuration keeps running on its old key. */
  readonly skipped: readonly {
    readonly dataMartId: string;
    readonly configId: string | null;
    readonly reason: string;
  }[];
  /** A converted configuration that lost something worth a log line. */
  readonly warnings: readonly {
    readonly dataMartId: string;
    readonly configId: string;
    readonly reason: string;
  }[];
}

interface Converted {
  readonly definitionId: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  readonly connectorTitle: string;
  readonly oauth?: OAuthOrigin;
}

/** The project-level OAuth row a configuration's values came from. */
interface OAuthOrigin {
  readonly rowId: string;
  readonly connectedBy: string | null;
  readonly connection: SourceConnection;
  /** The row names an account that cannot be read. */
  readonly accountDropped: boolean;
}

interface ConversionItem extends Converted {
  readonly source: UnconvertedSourceConfig;
  readonly configId: string;
  readonly projectId: string;
  readonly ownerIds: readonly string[];
  readonly materialKey: string;
}

type ManifestModel = CustomConnectorKeyModel & {
  readonly parameters: Record<string, { label?: string; attributes?: string[] }>;
  readonly keyParameterMisuse: readonly { node: string | null; position: string }[];
};

/** The Credentials and bindings that replace the old Source keys; it reads and writes nothing. */
export function planSourceCredentialConversion(
  sources: readonly UnconvertedSourceConfig[],
  options: SourceConversionOptions
): SourceConversionPlan {
  const converted: (Converted & { source: UnconvertedSourceConfig; configId: string })[] = [];
  const bindings: SourceConversionPlan['bindings'][number][] = [];
  const skipped: SourceConversionPlan['skipped'][number][] = [];
  const warnings: SourceConversionPlan['warnings'][number][] = [];
  // Runs find the binding by _id, so twins sharing one would all run on one Credential.
  const idKey = (dataMartId: string, id: unknown) =>
    JSON.stringify([dataMartId, typeof id === 'string' ? bindingIdKey(id) : id]);
  const idCount = new Map<string, number>();
  for (const { dataMartId, config } of sources) {
    const key = idKey(dataMartId, config._id);
    idCount.set(key, (idCount.get(key) ?? 0) + 1);
  }
  for (const source of sources) {
    const id = source.config._id;
    const configId = typeof id === 'string' && id !== '' ? id : null;
    const outcome = toConverted(source, options);
    if (outcome === null) continue;
    const skip = (reason: string) =>
      skipped.push({ dataMartId: source.dataMartId, configId, reason });
    if (typeof outcome === 'string') skip(outcome);
    else if (configId === null) skip('the configuration has no id');
    else if (idCount.get(idKey(source.dataMartId, configId))! > 1) {
      skip('configurations of the Data Mart share this id');
    } else if ([...configId].length > REQUIREMENT_KEY_LENGTH) {
      skip(`its id is longer than ${REQUIREMENT_KEY_LENGTH} characters`);
    } else if ('credentialId' in outcome) {
      const { dataMartId, projectId } = source;
      bindings.push({ dataMartId, configId, projectId, credentialId: outcome.credentialId });
    } else {
      converted.push({ ...outcome, source, configId });
      if (outcome.oauth?.accountDropped) {
        warnings.push({
          dataMartId: source.dataMartId,
          configId,
          reason: 'its old key names an account that cannot be read, so the Credential keeps none',
        });
      }
    }
  }

  // Data Marts sharing an OAuth row share its owners: the row becomes one Credential.
  const rowOwners = new Map<string, string[]>();
  for (const { oauth, source } of converted) {
    if (!oauth) continue;
    rowOwners.set(oauth.rowId, [...(rowOwners.get(oauth.rowId) ?? []), ...ownersOf(source)]);
  }
  const items: ConversionItem[] = converted.map(item => ({
    ...item,
    projectId: item.source.projectId,
    ownerIds: !item.oauth
      ? ownersOf(item.source)
      : item.oauth.connectedBy
        ? [item.oauth.connectedBy]
        : [...new Set(rowOwners.get(item.oauth.rowId))].sort(),
    materialKey: materialKey(item.definitionId, item.secret, item.publicMetadata),
  }));
  return { credentials: groupConversionItems(items).map(toPlanned), bindings, skipped, warnings };
}

/** The values, a Credential to bind, why the configuration keeps its old key, or null when it holds no key. */
function toConverted(
  source: UnconvertedSourceConfig,
  { oldRows, credentials }: SourceConversionOptions
): Converted | { readonly credentialId: string } | string | null {
  const { connectorName, projectId } = source;
  const hasOldKey = oldKeyIdsOf(source.config).length > 0;
  const bundled = bundledSourceConnectors().find(connector => connector.name === connectorName);
  if (!bundled && !source.custom) {
    if (!hasOldKey) return null;
    return source.custom === null
      ? 'its custom connector has no published version to run'
      : 'unknown connector';
  }

  const reference = sourceCredentialReference(source.config);
  const named = reference && credentials.get(reference.id);
  if (named) {
    if (named.projectId !== projectId) return 'its old key belongs to another project';
    return sourceDefinitionIdsFor(connectorName).includes(named.definitionId)
      ? { credentialId: reference.id }
      : 'its old key names a Credential of another connector';
  }

  const config = structuredClone(source.config) as Config;
  let rotated: unknown;
  // The token of the row a run's pickup reads: the OAuth row's, else the _secrets_id row's.
  let base: unknown;
  const secretsId = config._secrets_id;
  if (typeof secretsId === 'string' && secretsId !== '') {
    const values = rowValues(oldRows.get(secretsId), source, false);
    if (typeof values === 'string') return values;
    for (const [path, value] of Object.entries(values)) {
      if (path !== GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD) setAt(config, path.split('.'), value);
    }
    rotated = base = values[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];
  }
  let oauth: OAuthOrigin | undefined;
  if (reference) {
    const row = oldRows.get(reference.id);
    const values = rowValues(row, source, true);
    if (typeof values === 'string') return values;
    // As the run injects the row: through the variant's OAuth mapping, else as stored.
    const mapping = bundled && variantOf(bundled, reference.path)?.oauthParams?.mapping;
    const { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: token, ...stored } = values;
    const target = objectAt(config, reference.path)!;
    delete target._source_credential_id;
    Object.assign(
      target,
      mapping
        ? Object.fromEntries(
            Object.entries(mapping).map(([parameter, spec]) => [
              parameter,
              mappedValue(spec, values),
            ])
          )
        : stored
    );
    rotated ??= token;
    base = token;
    oauth = { rowId: reference.id, connectedBy: row!.userId, ...connectionOf(row!) };
  }

  const tokens = {
    ...(text(rotated) && { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: rotated }),
    ...(text(base) && { [OLD_ROW_TOKEN_FIELD]: base }),
  };
  const result = source.custom
    ? fromManifest(source.custom, config, tokens)
    : fromBundled(bundled!, config, tokens, oauth);
  if (result !== null && result !== NO_SELECTION) return result;
  // Without key values, only an old key reference makes the configuration worth a log line.
  return hasOldKey ? (result ?? 'its old key holds no key values') : null;
}

/** A bundled connector's values on the definition of the variant the configuration runs. */
function fromBundled(
  connector: ConnectorSpecSource,
  config: Config,
  tokens: Record<string, string>,
  oauth: OAuthOrigin | undefined
): Converted | string | null {
  const binding = selectedBinding(sourceBindingsFor(connector.name), config);
  if (binding === null || typeof binding === 'string') return binding;
  const values = bindingValues(connector, binding, config);
  if (typeof values === 'string') return values;
  if (Object.keys(values).length === 0) return null;
  const connectorTitle = connector.manifest.title;
  const contract = sourceCredentialDefinitions().definitions.find(
    definition => definition.id === binding.definitionId
  );
  if (contract?.auth.type !== 'fields') {
    // A reused built-in (github, google-service-account) holds the key as one value.
    const { value } = values;
    const key =
      binding.definitionId === 'google-service-account' ? readGoogleServiceAccountKey(value) : null;
    if (typeof key === 'string') return 'not a valid Google service account key';
    return {
      definitionId: binding.definitionId,
      secret: { value },
      publicMetadata: key?.metadata ?? null,
      connectorTitle,
    };
  }
  const secret: Record<string, string> = {};
  const fields: Record<string, string> = {};
  for (const field of contract.auth.fields) {
    const value = values[field.key];
    if (value === undefined) {
      if (field.required) return `no value for ${field.label}`;
      continue;
    }
    (field.secret ? secret : fields)[field.key] = value;
  }
  Object.assign(secret, tokens);
  return {
    definitionId: binding.definitionId,
    secret: { fields: secret },
    publicMetadata: oauth ? { fields, connection: oauth.connection } : { fields },
    connectorTitle,
    oauth,
  };
}

/** A custom connector's key parameters on a Credential that fits the manifest version it runs. */
function fromManifest(
  custom: { readonly title: string; readonly manifest: unknown },
  config: Config,
  tokens: Record<string, string>
): Converted | string | null {
  let model: ManifestModel;
  try {
    model = new Core.ManifestParser().parse(JSON.stringify(parsedJson(custom.manifest)));
  } catch {
    return 'its custom connector manifest does not parse';
  }
  const selectionParameter = model.authentication?.selectionParameter;
  const selected = selectionParameter ? config[selectionParameter] : undefined;
  const selection = typeof selected === 'string' ? selected : undefined;
  const keys = selectedKeyParameters(model, selection);
  if (!keys) return NO_SELECTION;

  const fieldList: CustomConnectorFieldSpec[] = [];
  const secret: Record<string, string> = {};
  const fields: Record<string, string> = {};
  for (const key of keys) {
    const value = config[key];
    if (key === GENERATED_REFRESH_TOKEN_CONFIG_FIELD || !filled(value)) continue;
    if (typeof value !== 'string') return 'a key value is not text';
    const parameter = model.parameters[key];
    const isSecret = parameter?.attributes?.includes(CONFIG_ATTRIBUTES.SECRET) ?? false;
    fieldList.push({ key, label: parameter?.label ?? key, secret: isSecret });
    (isSecret ? secret : fields)[key] = value;
  }
  if (fieldList.length === 0) return null;
  const [misuse] = model.keyParameterMisuse;
  if (misuse) {
    return `the manifest uses a key parameter in ${misuse.position}${misuse.node ? ` of node ${misuse.node}` : ''}`;
  }
  const publicMetadata = {
    hosts: [...new Set(model.allowedHosts.map(host => host.toLowerCase()))],
    fieldList,
    fields,
  };
  if (!fitCustomConnectorCredential(model, publicMetadata, selection).fits) {
    return 'no value for a required key parameter';
  }
  Object.assign(secret, tokens);
  return {
    definitionId: CUSTOM_CONNECTOR_DEFINITION_ID,
    secret: { fields: secret },
    publicMetadata,
    connectorTitle: custom.title,
  };
}

/** The binding of the variant the run takes (the first under `AuthType`); null when that needs no key. */
function selectedBinding(
  bindings: readonly SourceCredentialBinding[],
  config: Config
): SourceCredentialBinding | string | null {
  const [parameter] = bindings[0]?.path ?? [];
  if (parameter === undefined) return bindings[0] ?? null;
  const selected = config[parameter];
  const [variant] = isRecord(selected) ? Object.keys(selected) : [];
  if (variant === undefined) return bindings.length === 1 ? bindings[0] : NO_SELECTION;
  return bindings.find(binding => binding.path[1] === variant) ?? null;
}

/** Credential field values as the connector reads them: a deprecated top-level parameter only where its getter falls back to it. */
function bindingValues(
  connector: ConnectorSpecSource,
  binding: SourceCredentialBinding,
  config: Config
): Record<string, string> | string {
  const variant = objectAt(config, binding.path);
  const readable = (name: string) =>
    binding.path.length > 0 &&
    (variant === undefined || DEPRECATED_READ_WITH_VARIANT[connector.name]?.includes(name));
  const deprecated = new Map(
    Object.entries(connector.parameters)
      .filter(
        ([name, item]) => item.attributes?.includes(CONFIG_ATTRIBUTES.DEPRECATED) && readable(name)
      )
      .map(([name]) => [name.toLowerCase(), name])
  );
  const at = variant ?? {};
  const values: Record<string, string> = {};
  for (const [field, parameter] of Object.entries(binding.fieldMap)) {
    const fallback = deprecated.get(parameter.toLowerCase());
    const value = filled(at[parameter]) ? at[parameter] : fallback && config[fallback];
    if (!filled(value)) continue;
    if (typeof value !== 'string') return 'a key value is not text';
    values[field] = value;
  }
  return values;
}

/** The old row's values, or why they cannot be used; the run applies the same boundary. */
function rowValues(
  row: OldSourceKeyRow | undefined,
  { projectId, connectorName }: UnconvertedSourceConfig,
  exactConnector: boolean
): Config | string {
  if (!row) return 'its old key row is missing';
  if (row.projectId !== projectId) return 'its old key belongs to another project';
  const sameConnector = exactConnector
    ? row.connectorName === connectorName
    : row.connectorName.toLowerCase() === connectorName.toLowerCase();
  if (!sameConnector) return 'its old key belongs to another connector';
  try {
    const credentials = parsedJson(row.credentials);
    return isRecord(credentials) ? credentials : 'unparseable old key row';
  } catch {
    return 'unparseable old key row';
  }
}

const OLD_ROW_USER = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  email: z.string().nullish(),
});

/** As Connect records a sign-in. */
function connectionOf(row: OldSourceKeyRow): {
  connection: SourceConnection;
  accountDropped: boolean;
} {
  let user: z.infer<typeof OLD_ROW_USER> | null = null;
  let accountDropped = false;
  try {
    const raw = parsedJson(row.user);
    const parsed = OLD_ROW_USER.safeParse(raw);
    if (parsed.success) user = parsed.data;
    else accountDropped = raw !== null && raw !== undefined;
  } catch {
    // An unreadable account is no account.
    accountDropped = true;
  }
  return {
    connection: {
      account:
        user && user.id !== UNKNOWN_ACCOUNT_ID
          ? { id: user.id, name: user.name ?? null, email: user.email ?? null }
          : null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
    accountDropped,
  };
}

function toPlanned(group: readonly ConversionItem[]): PlannedSourceCredential {
  const [earliest] = [...group].sort(
    (a, b) => a.source.createdAt.getTime() - b.source.createdAt.getTime()
  );
  const connected = group.find(item => item.oauth) ?? earliest;
  const account = group.map(item => item.oauth?.connection.account).find(Boolean);
  return {
    projectId: earliest.projectId,
    definitionId: earliest.definitionId,
    // credential.title is varchar(255); a longer value would stop the migration on MySQL.
    title: (
      account?.name ||
      account?.email ||
      `${earliest.connectorTitle} — ${earliest.source.dataMartTitle}`
    ).slice(0, 255),
    secret: connected.secret,
    publicMetadata: connected.publicMetadata,
    ownerIds: earliest.ownerIds,
    contextIds: group
      .map(item => item.source.contextIds)
      .reduce((shared, ids) => shared.filter(id => ids.includes(id))),
    bindings: group.map(item => ({ dataMartId: item.source.dataMartId, configId: item.configId })),
  };
}

function ownersOf({ technicalOwnerIds, businessOwnerIds }: UnconvertedSourceConfig): string[] {
  return [...new Set(technicalOwnerIds.length ? technicalOwnerIds : businessOwnerIds)].sort();
}

/** The first `_source_credential_id` and where it sits, as the run finds it. */
function sourceCredentialReference(
  value: unknown,
  path: readonly string[] = []
): { readonly id: string; readonly path: readonly string[] } | undefined {
  if (!isRecord(value)) return undefined;
  const id = value._source_credential_id;
  if (typeof id === 'string' && id !== '') return { id, path };
  for (const [key, item] of Object.entries(value)) {
    const found = sourceCredentialReference(item, [...path, key]);
    if (found) return found;
  }
  return undefined;
}

function variantOf(connector: ConnectorSpecSource, path: readonly string[]) {
  const [parameter, variant] = path;
  return path.length === 2
    ? connector.parameters[parameter]?.oneOf?.find(option => option.value === variant)
    : undefined;
}

/** What the run puts in a parameter for one entry of `oauthParams.mapping`. */
function mappedValue(spec: unknown, values: Config): unknown {
  if (!isRecord(spec) || typeof spec.key !== 'string') return spec;
  return values[spec.key] ?? '';
}

function setAt(config: Config, path: readonly string[], value: unknown): void {
  let current = config;
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as Config;
  }
  current[path[path.length - 1]] = value;
}

function objectAt(config: Config, path: readonly string[]): Config | undefined {
  let current: unknown = config;
  for (const key of path) current = isRecord(current) ? current[key] : undefined;
  return isRecord(current) ? current : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function filled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function isRecord(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
