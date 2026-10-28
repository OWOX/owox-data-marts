import {
  CREDENTIAL_CONSUMER_TYPE_STORAGE,
  type AcceptedCredentialRequirement,
  type CredentialDefinitionContract,
  type CredentialPublicMetadata,
  type CredentialValidationState,
} from '../credentials/credential.types';
import { builtinOAuthAuth } from '../credentials/services/builtin-credential-definitions';
import type { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import { DataStorageType } from './enums/data-storage-type.enum';
import { STORAGE_CREDENTIAL_DEFINITION_IDS } from './storage-credential-definitions';

/** The one requirement key a Storage binds its Credential under. */
export const STORAGE_REQUIREMENT_KEY = 'storage';

export const STORAGE_BINDING = {
  consumerType: CREDENTIAL_CONSUMER_TYPE_STORAGE,
  requirementKey: STORAGE_REQUIREMENT_KEY,
} as const;

export type StorageCredentialState =
  | 'ready'
  | 'disabled'
  | 'not-configured'
  | 'reconnect-required'
  | 'reauthorize-required';

export type StorageCredentialSummary =
  | {
      access: 'visible';
      id: string;
      title: string;
      definitionId: string;
      providerName: string;
      identity: string | null;
      state: StorageCredentialState;
    }
  | { access: 'restricted'; state: StorageCredentialState }
  // No binding in its own project; still runs on its old key until a Credential is selected.
  | { access: 'pending'; state: 'ready' };

// Google reports the email and profile scopes in their URL form.
const GOOGLE_SCOPE_ALIASES = new Map([
  ['https://www.googleapis.com/auth/userinfo.email', 'email'],
  ['https://www.googleapis.com/auth/userinfo.profile', 'profile'],
]);

const SIGN_IN_SCOPES = new Set(['openid', 'email', 'profile']);

function canonicalScope(scope: string): string {
  return GOOGLE_SCOPE_ALIASES.get(scope) ?? scope;
}

/** The configured scopes a grant must hold; sign-in scopes only name the account. */
export function withoutSignInScopes(scopes: readonly string[]): string[] {
  return scopes.filter(scope => !SIGN_IN_SCOPES.has(canonicalScope(scope)));
}

/** What a Storage of the type accepts, for binds, summaries and runs; null scopes without sign-in. */
export function storageCredentialRequirement(
  type: DataStorageType,
  googleOAuthConfig: Pick<GoogleOAuthConfigService, 'isClientConfigured' | 'getScopes'>
): AcceptedCredentialRequirement {
  const definitionIds = STORAGE_CREDENTIAL_DEFINITION_IDS[type];
  if (!definitionIds) throw new Error(`Unknown Storage type ${type}`);
  // The scopes come from the BigQuery Google account definition the type accepts.
  const oauth = definitionIds.map(id => builtinOAuthAuth(id)).find(auth => auth !== null);
  if (!oauth) return { definitionIds, scopes: [] };
  return {
    definitionIds,
    scopes: googleOAuthConfig.isClientConfigured(oauth.client)
      ? withoutSignInScopes(googleOAuthConfig.getScopes(oauth.scopes))
      : null,
  };
}

/** The Storage types that accept the definition, from the map storageCredentialRequirement reads. */
export function storageTypesForDefinition(definitionId: string): DataStorageType[] {
  return Object.values(DataStorageType).filter(type =>
    STORAGE_CREDENTIAL_DEFINITION_IDS[type].includes(definitionId)
  );
}

/** What stops a Storage, from its Credential alone, for lists and runs; null scopes: no sign-in. */
export function storageCredentialState(
  credential: {
    readonly enabled: boolean;
    readonly validationState: CredentialValidationState;
    readonly publicMetadata: CredentialPublicMetadata | null;
  },
  contract: { auth: { type: CredentialDefinitionContract['auth']['type'] } },
  requiredScopes: readonly string[] | null
): StorageCredentialState {
  if (!credential.enabled) return 'disabled';
  if (contract.auth.type !== 'oauth') return 'ready';
  if (requiredScopes === null) return 'not-configured';
  if (credential.validationState === 'rejected') return 'reconnect-required';
  const metadata = credential.publicMetadata;
  const granted = new Set(
    (metadata && 'scopes' in metadata ? metadata.scopes : []).map(canonicalScope)
  );
  return requiredScopes.every(scope => granted.has(canonicalScope(scope)))
    ? 'ready'
    : 'reauthorize-required';
}
