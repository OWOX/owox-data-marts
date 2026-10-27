// Imported by migration 1792600000000: keep it and its imports when the legacy code goes.
import {
  credentialIdentity,
  type AcceptedCredentialRequirement,
  type CredentialPublicMetadata,
  type CredentialSecret,
} from '../../credentials/credential.types';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../../credentials/services/builtin-credential-definitions';
import { materialKey } from '../../credentials/services/credential-material-key';
import type { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import {
  storageCredentialRequirement,
  storageCredentialState,
} from '../../data-storage-types/storage-credential-state';
import type { CredentialIdentity } from '../../entities/credential-identity.type';
import type { StoredStorageCredentials } from '../../entities/stored-storage-credentials.type';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import type { GoogleOAuthTokens } from '../google-oauth/google-oauth-flow.service';
import { groupConversionItems } from './grouping';
import {
  definitionIdForStorageCredentialType,
  fromStoredStorageCredentials,
} from './legacy-storage-credential-definitions';

/** A live Storage on a live old key row with no storage binding row, as the migration reads it. */
export interface UnconvertedStorage {
  readonly id: string;
  readonly projectId: string;
  readonly title: string | null;
  readonly type: DataStorageType;
  readonly createdAt: Date;
  readonly ownerIds: readonly string[];
  readonly contextIds: readonly string[];
  /** The old key row's columns as the driver returns them: JSON may still be text. */
  readonly key: {
    readonly type: string;
    readonly credentials: unknown;
    readonly identity: unknown;
  };
}

export interface ConversionOptions {
  /** OAUTH_GOOGLE_STORAGE_CLIENT_ID, the issuer of every converted grant. */
  readonly googleStorageClientId: string | undefined;
  /** The BigQuery scopes a binding snapshots; null while Google sign-in is not configured. */
  readonly bigQueryScopes: readonly string[] | null;
}

export interface PlannedCredential {
  readonly projectId: string;
  readonly definitionId: string;
  readonly title: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  readonly ownerIds: readonly string[];
  readonly contextIds: readonly string[];
  readonly bindings: readonly {
    readonly storageId: string;
    readonly requirement: AcceptedCredentialRequirement;
  }[];
}

export interface ConversionPlan {
  readonly credentials: readonly PlannedCredential[];
  /** A skipped Storage keeps running on its old key. */
  readonly skipped: readonly { readonly storageId: string; readonly reason: string }[];
  /** Converted Storages whose Google grant lacks a configured scope: they stop until a reconnect. */
  readonly lackingScopes: readonly string[];
}

interface ConversionItem {
  readonly storage: UnconvertedStorage;
  readonly projectId: string;
  readonly definitionId: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  readonly ownerIds: readonly string[];
  readonly materialKey: string;
  readonly requirement: AcceptedCredentialRequirement;
}

/** The Credentials and bindings that replace the old key rows; it reads and writes nothing. */
export function planStorageCredentialConversion(
  storages: readonly UnconvertedStorage[],
  options: ConversionOptions
): ConversionPlan {
  const items: ConversionItem[] = [];
  const skipped: { storageId: string; reason: string }[] = [];
  for (const storage of storages) {
    const item = toItem(storage, options);
    if (typeof item === 'string') skipped.push({ storageId: storage.id, reason: item });
    else items.push(item);
  }
  const lackingScopes = items
    .filter(
      item =>
        'oauth' in item.secret &&
        storageCredentialState(
          { enabled: true, validationState: 'unknown', publicMetadata: item.publicMetadata },
          { auth: { type: 'oauth' } },
          item.requirement.scopes
        ) === 'reauthorize-required'
    )
    .map(item => item.storage.id);
  return {
    credentials: groupConversionItems(items).map(toPlannedCredential),
    skipped,
    lackingScopes,
  };
}

/** The item, or why the Storage keeps its old key; a reason never quotes a key value. */
function toItem(storage: UnconvertedStorage, options: ConversionOptions): ConversionItem | string {
  const type = storage.key.type as StorageCredentialType;
  if (!Object.values(StorageCredentialType).includes(type)) return 'unknown key type';
  const clientId = options.googleStorageClientId;
  if (type === StorageCredentialType.GOOGLE_OAUTH && !clientId) {
    return 'Google sign-in is not configured';
  }
  let converted: Pick<ConversionItem, 'definitionId' | 'secret' | 'publicMetadata'>;
  try {
    const stored = parsed(storage.key.credentials) as StoredStorageCredentials;
    converted =
      type === StorageCredentialType.GOOGLE_OAUTH
        ? fromOAuthRow(stored, parsed(storage.key.identity) as CredentialIdentity | null, clientId!)
        : fromStoredStorageCredentials(type, stored);
  } catch {
    return 'unparseable credentials';
  }
  let requirement: AcceptedCredentialRequirement;
  try {
    const scopes = options.bigQueryScopes;
    requirement = storageCredentialRequirement(storage.type, {
      isClientConfigured: () => scopes !== null,
      getScopes: () => [...(scopes ?? [])],
    });
  } catch {
    return 'unknown Storage type';
  }
  return {
    ...converted,
    storage,
    projectId: storage.projectId,
    ownerIds: [...new Set(storage.ownerIds)].sort(),
    materialKey: materialKey(converted.definitionId, converted.secret, converted.publicMetadata),
    requirement,
  };
}

function parsed(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function fromOAuthRow(
  stored: StoredStorageCredentials,
  identity: CredentialIdentity | null,
  clientId: string
): Pick<ConversionItem, 'definitionId' | 'secret' | 'publicMetadata'> {
  // Picked field by field so the id_token Google also returns is not kept.
  const { access_token, refresh_token, token_type, scope, expiry_date } =
    stored as GoogleOAuthTokens;
  const email = identity?.email;
  return {
    definitionId: definitionIdForStorageCredentialType(StorageCredentialType.GOOGLE_OAUTH, stored),
    secret: {
      oauth: {
        provider: 'google',
        clientId,
        tokens: { access_token, refresh_token, token_type, scope, expiry_date },
      },
    },
    publicMetadata: {
      // A row whose account lookup failed names no account; reconnecting may pick any.
      account: email
        ? { email, name: identity?.name ?? null, picture: identity?.picture ?? null }
        : { email: '', name: null, picture: null },
      scopes: (scope ?? '').split(' ').filter(Boolean),
    },
  };
}

function toPlannedCredential(group: readonly ConversionItem[]): PlannedCredential {
  // A merged OAuth Credential takes the newest access token.
  const [source] = [...group].sort((a, b) => expiryOf(b.secret) - expiryOf(a.secret));
  const [earliest] = [...group].sort(
    (a, b) => a.storage.createdAt.getTime() - b.storage.createdAt.getTime()
  );
  const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(
    definition => definition.id === source.definitionId
  )!;
  const identityOf = (item: ConversionItem) => credentialIdentity(contract, item.publicMetadata);
  const identified = group.find(identityOf);
  return {
    projectId: source.projectId,
    definitionId: source.definitionId,
    // credential.title is varchar(255); a longer value would stop the migration on MySQL.
    title: (
      (identified && identityOf(identified)) ||
      earliest.storage.title ||
      contract.displayName
    ).slice(0, 255),
    secret: source.secret,
    publicMetadata: (identified ?? source).publicMetadata,
    ownerIds: source.ownerIds,
    contextIds: group
      .map(item => item.storage.contextIds)
      .reduce((shared, ids) => shared.filter(id => ids.includes(id))),
    bindings: group.map(item => ({ storageId: item.storage.id, requirement: item.requirement })),
  };
}

function expiryOf(secret: CredentialSecret): number {
  return 'oauth' in secret ? (secret.oauth.tokens.expiry_date ?? 0) : 0;
}
