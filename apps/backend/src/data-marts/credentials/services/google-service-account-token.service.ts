import { Inject, Injectable, Optional } from '@nestjs/common';
import { JWT, type JWTOptions } from 'google-auth-library';
import { createHash } from 'node:crypto';
import type { CredentialSecret, CredentialValidationResult } from '../credential.types';
import { parseGoogleServiceAccountKey } from './google-service-account-key';

export const GOOGLE_TOKEN_TRANSPORTER = Symbol('GOOGLE_TOKEN_TRANSPORTER');
export type GoogleTokenTransporter = NonNullable<JWTOptions['transporter']>;
export type GoogleTokenFailure = 'rejected' | 'scope' | 'unavailable';

export class GoogleTokenError extends Error {
  constructor(
    readonly failure: GoogleTokenFailure,
    message: string
  ) {
    super(message);
    this.name = 'GoogleTokenError';
  }
}

export interface GoogleTokenRequest {
  readonly credentialId: string;
  readonly secret: CredentialSecret;
  readonly scopes: readonly string[];
}

const IDLE_MS = 60 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 10_000;
// A stalled token POST would otherwise stay in flight for minutes and fail every call reusing it.
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
// Google may refuse a key for about a minute after it is created.
const NEW_KEY_HINT = ' A key created in the last minute may not work yet.';
const VERIFY_SCOPES = ['https://www.googleapis.com/auth/userinfo.email'];
// google-auth-library throws this plain Error when Google answers with an ID token only.
const NO_ACCESS_TOKEN_MESSAGE = 'Could not refresh access token.';

/**
 * Mints Google access tokens from stored service account keys. google-auth-library caches each
 * client's token, refreshes it before expiry and runs one mint at a time; this service only keeps
 * one client per Credential, key and scopes, and never holds or logs a token itself.
 */
@Injectable()
export class GoogleServiceAccountTokenService {
  private readonly clients = new Map<string, { client: JWT; lastUsedAt: number }>();

  constructor(
    @Optional()
    @Inject(GOOGLE_TOKEN_TRANSPORTER)
    private readonly transporter?: GoogleTokenTransporter
  ) {}

  async verify(secret: CredentialSecret): Promise<CredentialValidationResult> {
    const validatedAt = new Date();
    let client: JWT;
    try {
      client = this.createClient(secret, VERIFY_SCOPES);
    } catch (error) {
      // A key that does not parse never reached Google, so the new-key hint does not apply.
      return {
        state: 'rejected',
        message: error instanceof Error ? error.message : 'The key is not valid',
        validatedAt,
      };
    }
    try {
      await mint(client, AbortSignal.timeout(VERIFY_TIMEOUT_MS));
      return { state: 'verified', message: 'Google issued a token for this key', validatedAt };
    } catch (error) {
      if (error instanceof GoogleTokenError && error.failure === 'rejected') {
        return { state: 'rejected', message: `${error.message}${NEW_KEY_HINT}`, validatedAt };
      }
      return {
        state: 'unknown',
        message: 'Google could not be reached to check the key',
        validatedAt,
      };
    }
  }

  async getAccessToken(
    input: GoogleTokenRequest & { readonly signal: AbortSignal }
  ): Promise<string> {
    const now = Date.now();
    for (const [key, entry] of this.clients) {
      if (now - entry.lastUsedAt > IDLE_MS) this.clients.delete(key);
    }
    const key = cacheKey(input);
    let entry = this.clients.get(key);
    if (!entry) {
      entry = { client: this.createClient(input.secret, input.scopes), lastUsedAt: now };
      this.clients.set(key, entry);
    }
    entry.lastUsedAt = now;
    try {
      return await mint(entry.client, input.signal);
    } catch (error) {
      // A mint that lost the race to the caller's signal keeps running; a later call reuses it.
      if (!input.signal.aborted && this.clients.get(key) === entry) this.clients.delete(key);
      throw error;
    }
  }

  /** Evicts the client only while it still holds the refused token, so a fresh one survives. */
  drop(input: GoogleTokenRequest, staleToken: string): void {
    const key = cacheKey(input);
    if (this.clients.get(key)?.client.credentials.access_token === staleToken) {
      this.clients.delete(key);
    }
  }

  private createClient(secret: CredentialSecret, scopes: readonly string[]): JWT {
    let key: ReturnType<typeof parseGoogleServiceAccountKey>['key'];
    try {
      ({ key } = parseGoogleServiceAccountKey(secret.value));
    } catch (error) {
      throw new GoogleTokenError(
        'rejected',
        error instanceof Error ? error.message : 'The key is not valid'
      );
    }
    // JWT always posts to https://oauth2.googleapis.com/token; the key's token_uri is never read.
    return new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: [...scopes],
      transporter: this.transporter,
      // Without it the library logs token responses when GOOGLE_SDK_NODE_LOGGING is set.
      useAuthRequestParameters: false,
      transporterOptions: { timeout: TOKEN_REQUEST_TIMEOUT_MS },
    });
  }
}

function cacheKey(input: GoogleTokenRequest): string {
  const secretHash = createHash('sha256').update(input.secret.value).digest('hex');
  return `${input.credentialId}:${secretHash}:${input.scopes.join(' ')}`;
}

async function mint(client: JWT, signal: AbortSignal): Promise<string> {
  let token: string | null | undefined;
  try {
    ({ token } = await raceSignal(client.getAccessToken(), signal));
  } catch (error) {
    throw classify(error);
  }
  if (!token) throw new GoogleTokenError('scope', 'Google issued no access token');
  return token;
}

/** JWT accepts no abort signal and gaxios retries the token request, so the caller's signal bounds the wait. */
function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('aborted'));
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function classify(error: unknown): GoogleTokenError {
  if (error instanceof GoogleTokenError) return error;
  const response = (
    error as {
      response?: { status?: number; data?: { error?: unknown; error_description?: unknown } };
    } | null
  )?.response;
  if (!response) {
    return error instanceof Error && error.message === NO_ACCESS_TOKEN_MESSAGE
      ? new GoogleTokenError('scope', 'Google issued no access token')
      : new GoogleTokenError('unavailable', 'Google could not be reached');
  }
  const status = response.status ?? 0;
  const code = response.data?.error;
  if (status >= 400 && status < 500 && status !== 429 && typeof code === 'string') {
    if (code === 'invalid_scope') {
      return new GoogleTokenError('scope', 'Google issued no access token');
    }
    const description = response.data?.error_description;
    return new GoogleTokenError(
      'rejected',
      typeof description === 'string' && description ? `${code}: ${description}` : code
    );
  }
  return new GoogleTokenError('unavailable', 'Google could not be reached');
}
