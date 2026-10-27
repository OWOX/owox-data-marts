// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import type { GoogleOAuthConfigService } from '../../services/google-oauth/google-oauth-config.service';
import type {
  AcceptedCredentialRequirement,
  CredentialDefinitionContract,
  CredentialPublicMetadata,
  CredentialValidationState,
} from '../credential.types';
import { builtinOAuthAuth } from './builtin-credential-definitions';

export type CredentialConsumerState =
  | 'ready'
  | 'disabled'
  | 'not-configured'
  | 'reconnect-required'
  | 'reauthorize-required';

/** A Storage's or Destination's Credential as a member sees it. */
export type CredentialConsumerSummary =
  | {
      access: 'visible';
      id: string;
      title: string;
      definitionId: string;
      providerName: string;
      identity: string | null;
      state: CredentialConsumerState;
    }
  | { access: 'restricted'; state: CredentialConsumerState }
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

/** Any of the definitions, with the scopes of the Google account one among them; null scopes without sign-in. */
export function acceptedCredentialRequirement(
  definitionIds: readonly string[],
  googleOAuthConfig: Pick<GoogleOAuthConfigService, 'isClientConfigured' | 'getScopes'>
): AcceptedCredentialRequirement {
  const oauth = definitionIds.map(id => builtinOAuthAuth(id)).find(auth => auth !== null);
  if (!oauth) return { definitionIds, scopes: [] };
  return {
    definitionIds,
    scopes: googleOAuthConfig.isClientConfigured(oauth.client)
      ? withoutSignInScopes(googleOAuthConfig.getScopes(oauth.scopes))
      : null,
  };
}

/** What stops a consumer, from its Credential alone, for lists and runs; null scopes: no sign-in. */
export function credentialConsumerState(
  credential: {
    readonly enabled: boolean;
    readonly validationState: CredentialValidationState;
    readonly publicMetadata: CredentialPublicMetadata | null;
  },
  contract: { auth: { type: CredentialDefinitionContract['auth']['type'] } },
  requiredScopes: readonly string[] | null
): CredentialConsumerState {
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
