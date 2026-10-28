import { randomUUID } from 'node:crypto';
import type { CredentialPublicMetadata, CredentialSecret } from '../credential.types';

/** Sorted keys, exact strings, and a blank value dropped like an absent one. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, canonical(entry)] as const)
      .filter(([, entry]) => (typeof entry === 'string' ? entry.trim() !== '' : entry != null))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

type OAuthSecret = Extract<CredentialSecret, { oauth: unknown }>['oauth'];

/** An OAuth grant is its refresh token, issuing client and scopes; access tokens are transient. */
function oauthGrantKey(definitionId: string, { clientId, tokens }: OAuthSecret): string {
  const scopes = (tokens.scope ?? '').split(' ').filter(Boolean).sort();
  return JSON.stringify([definitionId, tokens.refresh_token ?? null, clientId, scopes]);
}

/** Equal for the same key; it holds secret values, so it stays in memory and is never logged. */
export function materialKey(
  definitionId: string,
  secret: CredentialSecret,
  metadata: CredentialPublicMetadata | null
): string {
  if ('oauth' in secret) {
    // Without a refresh token the grant cannot be told apart, so the row stays on its own.
    return secret.oauth.tokens.refresh_token
      ? oauthGrantKey(definitionId, secret.oauth)
      : randomUUID();
  }
  const material =
    'value' in secret
      ? parsedValue(secret.value)
      : { ...(metadata && 'fields' in metadata ? metadata.fields : {}), ...secret.fields };
  return JSON.stringify([definitionId, canonical(material)]);
}

/** A value that is not a JSON object, such as a plain API key, compares as the string itself. */
function parsedValue(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : value;
  } catch {
    return value;
  }
}
