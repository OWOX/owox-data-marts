// Imported by migration 1792600000000: keep it and its imports when the legacy code goes.
import type {
  AcceptedCredentialRequirement,
  CredentialPublicMetadata,
  CredentialSecret,
} from '../../credentials/credential.types';
import { materialKey } from '../../credentials/services/credential-material-key';
import type { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import {
  storageCredentialRequirement,
  storageCredentialState,
} from '../../data-storage-types/storage-credential-state';
import type { CredentialIdentity } from '../../entities/credential-identity.type';
import type { StoredStorageCredentials } from '../../entities/stored-storage-credentials.type';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import {
  fromGoogleOAuthRow,
  groupConversionItems,
  mergeConversionGroup,
  parsedJson,
} from './grouping';
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
    const stored = parsedJson(storage.key.credentials) as StoredStorageCredentials;
    converted =
      type === StorageCredentialType.GOOGLE_OAUTH
        ? fromGoogleOAuthRow(
            definitionIdForStorageCredentialType(type, stored),
            stored,
            parsedJson(storage.key.identity) as CredentialIdentity | null,
            clientId!
          )
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

function toPlannedCredential(group: readonly ConversionItem[]): PlannedCredential {
  return {
    ...mergeConversionGroup(group, item => item.storage),
    bindings: group.map(item => ({ storageId: item.storage.id, requirement: item.requirement })),
  };
}
