import {
  CREDENTIAL_CONSUMER_TYPE_STORAGE,
  type AcceptedCredentialRequirement,
} from '../credentials/credential.types';
import {
  acceptedCredentialRequirement,
  type CredentialConsumerState,
  type CredentialConsumerSummary,
} from '../credentials/services/credential-consumer-state';
import type { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import { DataStorageType } from './enums/data-storage-type.enum';
import { STORAGE_CREDENTIAL_DEFINITION_IDS } from './storage-credential-definitions';

export { credentialConsumerState as storageCredentialState } from '../credentials/services/credential-consumer-state';

/** The one requirement key a Storage binds its Credential under. */
export const STORAGE_REQUIREMENT_KEY = 'storage';

export const STORAGE_BINDING = {
  consumerType: CREDENTIAL_CONSUMER_TYPE_STORAGE,
  requirementKey: STORAGE_REQUIREMENT_KEY,
} as const;

export type StorageCredentialState = CredentialConsumerState;

export type StorageCredentialSummary = CredentialConsumerSummary;

/** What a Storage of the type accepts, for binds, summaries and runs; null scopes without sign-in. */
export function storageCredentialRequirement(
  type: DataStorageType,
  googleOAuthConfig: Pick<GoogleOAuthConfigService, 'isClientConfigured' | 'getScopes'>
): AcceptedCredentialRequirement {
  const definitionIds = STORAGE_CREDENTIAL_DEFINITION_IDS[type];
  if (!definitionIds) throw new Error(`Unknown Storage type ${type}`);
  return acceptedCredentialRequirement(definitionIds, googleOAuthConfig);
}

/** The Storage types that accept the definition, from the map storageCredentialRequirement reads. */
export function storageTypesForDefinition(definitionId: string): DataStorageType[] {
  return Object.values(DataStorageType).filter(type =>
    STORAGE_CREDENTIAL_DEFINITION_IDS[type].includes(definitionId)
  );
}
