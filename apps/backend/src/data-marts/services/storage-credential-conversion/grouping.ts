// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import {
  credentialIdentity,
  type CredentialPublicMetadata,
  type CredentialSecret,
} from '../../credentials/credential.types';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../../credentials/services/builtin-credential-definitions';
import type { CredentialIdentity } from '../../entities/credential-identity.type';
import type { GoogleOAuthTokens } from '../google-oauth/google-oauth-flow.service';

/** What every conversion item carries, for Storages and Destinations alike. */
export interface ConversionValues {
  readonly projectId: string;
  readonly definitionId: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  readonly ownerIds: readonly string[];
}

/** The Storage or Destination an item converts. */
export interface ConvertedConsumer {
  readonly title: string | null;
  readonly createdAt: Date;
  readonly contextIds: readonly string[];
}

/** The Credential a group becomes, bindings aside. */
export interface MergedConversionCredential {
  readonly projectId: string;
  readonly definitionId: string;
  readonly title: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
  readonly ownerIds: readonly string[];
  readonly contextIds: readonly string[];
}

/** Items become one Credential when project, definition, owner set and material are all equal. */
export function groupConversionItems<
  T extends {
    projectId: string;
    definitionId: string;
    ownerIds: readonly string[];
    materialKey: string;
  },
>(items: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = JSON.stringify([
      item.projectId,
      item.definitionId,
      [...item.ownerIds].sort(),
      item.materialKey,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

/** One group's Credential: newest token, identity else earliest title, shared Contexts. */
export function mergeConversionGroup<T extends ConversionValues>(
  group: readonly T[],
  consumerOf: (item: T) => ConvertedConsumer
): MergedConversionCredential {
  // A merged OAuth Credential takes the newest access token.
  const [source] = [...group].sort((a, b) => expiryOf(b.secret) - expiryOf(a.secret));
  const [earliest] = [...group].sort(
    (a, b) => consumerOf(a).createdAt.getTime() - consumerOf(b).createdAt.getTime()
  );
  const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(
    definition => definition.id === source.definitionId
  )!;
  const identityOf = (item: T) => credentialIdentity(contract, item.publicMetadata);
  const identified = group.find(identityOf);
  return {
    projectId: source.projectId,
    definitionId: source.definitionId,
    // credential.title is varchar(255); a longer value would stop the migration on MySQL.
    title: (
      (identified && identityOf(identified)) ||
      consumerOf(earliest).title ||
      contract.displayName
    ).slice(0, 255),
    secret: source.secret,
    publicMetadata: (identified ?? source).publicMetadata,
    ownerIds: source.ownerIds,
    contextIds: group
      .map(item => consumerOf(item).contextIds)
      .reduce((shared, ids) => shared.filter(id => ids.includes(id))),
  };
}

/** An old Google OAuth row as the Credential of the definition; the Destination conversion shares it. */
export function fromGoogleOAuthRow(
  definitionId: string,
  stored: unknown,
  identity: CredentialIdentity | null,
  clientId: string
): Pick<ConversionValues, 'definitionId' | 'secret' | 'publicMetadata'> {
  // Picked field by field so the id_token Google also returns is not kept.
  const { access_token, refresh_token, token_type, scope, expiry_date } =
    stored as GoogleOAuthTokens;
  const email = identity?.email;
  return {
    definitionId,
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

/** A value that may still be JSON text: SQLite returns a JSON column as text, MySQL parsed. */
export function parsedJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function expiryOf(secret: CredentialSecret): number {
  return 'oauth' in secret ? (secret.oauth.tokens.expiry_date ?? 0) : 0;
}
