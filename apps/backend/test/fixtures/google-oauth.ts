import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthConfigService } from '../../src/data-marts/services/google-oauth/google-oauth-config.service';
import { GoogleOAuthFlowService } from '../../src/data-marts/services/google-oauth/google-oauth-flow.service';

export const GOOGLE_OAUTH_ENV: Record<string, string> = {
  OAUTH_GOOGLE_STORAGE_CLIENT_ID: 'storage-client-id',
  OAUTH_GOOGLE_STORAGE_CLIENT_SECRET: 'storage-client-secret',
  OAUTH_GOOGLE_DESTINATION_CLIENT_ID: 'destination-client-id',
  OAUTH_GOOGLE_DESTINATION_CLIENT_SECRET: 'destination-client-secret',
  OAUTH_GOOGLE_REDIRECT_URI: 'https://app.example.com/oauth/callback',
  OAUTH_GOOGLE_JWT_SECRET: 'state-signing-secret',
};

export const REDIRECT_URI = GOOGLE_OAUTH_ENV.OAUTH_GOOGLE_REDIRECT_URI;

/** What Google's token endpoint returns for a BigQuery consent, including the id_token OWOX does not keep. */
export const GOOGLE_TOKENS = {
  access_token: 'ya29.access-token',
  refresh_token: '1//refresh-token',
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/bigquery openid email',
  expiry_date: 1_900_000_000_000,
  id_token: 'id-token',
};

export function googleOAuthConfig(): GoogleOAuthConfigService {
  return new GoogleOAuthConfigService({ get: (key: string) => GOOGLE_OAUTH_ENV[key] } as never);
}

export function googleOAuthFlow(config = googleOAuthConfig()) {
  const storageCredentials = { getById: jest.fn(), update: jest.fn() };
  const destinationCredentials = { create: jest.fn(), getById: jest.fn() };
  const flow = new GoogleOAuthFlowService(
    storageCredentials as never,
    destinationCredentials as never,
    config
  );
  return { flow, storageCredentials, destinationCredentials };
}

/** Google answers the code exchange and the userinfo call for this account. */
export function stubGoogleConsent(
  user: { email?: string; name?: string; picture?: string } = {
    email: 'analyst@example.com',
    name: 'Ana Lyst',
  }
) {
  const getToken = jest
    .spyOn(OAuth2Client.prototype, 'getToken')
    .mockResolvedValue({ tokens: { ...GOOGLE_TOKENS }, res: null } as never);
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ id: 'google-user-1', ...user })));
  return { getToken };
}
