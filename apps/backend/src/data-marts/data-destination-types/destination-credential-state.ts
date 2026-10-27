// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import {
  CREDENTIAL_CONSUMER_TYPE_DESTINATION,
  type AcceptedCredentialRequirement,
} from '../credentials/credential.types';
import {
  acceptedCredentialRequirement,
  type CredentialConsumerState,
  type CredentialConsumerSummary,
} from '../credentials/services/credential-consumer-state';
import type { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import type { DestinationPublicCredentials } from './destination-public-credentials';
import { DESTINATION_CREDENTIAL_DEFINITION_IDS } from './destination-credential-definitions';
import type { DataDestinationType } from './enums/data-destination-type.enum';

/** A Destination binds its one Credential under the `destination` requirement key. */
export const DESTINATION_BINDING = {
  consumerType: CREDENTIAL_CONSUMER_TYPE_DESTINATION,
  requirementKey: 'destination',
} as const;

export type DestinationCredentialState = CredentialConsumerState;

/**
 * A restricted or pending Google Sheets summary also names the address to share a sheet with and
 * its provider; `credentials` is the public shape clients read and never reaches a summary response.
 */
export type DestinationCredentialSummary = CredentialConsumerSummary & {
  identity?: string | null;
  definitionId?: string;
  credentials?: DestinationPublicCredentials;
};

// Writing needs no Drive access; create-document checks drive.file itself and only skips sharing.
const OPTIONAL_SCOPES = new Set(['https://www.googleapis.com/auth/drive.file']);

/** What a Destination of the type accepts, for binds, summaries and runs; null scopes without sign-in. */
export function destinationCredentialRequirement(
  type: DataDestinationType,
  googleOAuthConfig: Pick<GoogleOAuthConfigService, 'isClientConfigured' | 'getScopes'>
): AcceptedCredentialRequirement {
  const definitionIds = DESTINATION_CREDENTIAL_DEFINITION_IDS[type];
  if (!definitionIds) throw new Error(`Destination type ${type} takes no Credential`);
  const { scopes } = acceptedCredentialRequirement(definitionIds, googleOAuthConfig);
  return { definitionIds, scopes: scopes && scopes.filter(scope => !OPTIONAL_SCOPES.has(scope)) };
}
