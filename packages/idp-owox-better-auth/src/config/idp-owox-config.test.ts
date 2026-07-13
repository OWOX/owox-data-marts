import { describe, expect, it } from '@jest/globals';
import { loadBetterAuthProviderConfigFromEnv } from './idp-owox-config.js';

describe('loadBetterAuthProviderConfigFromEnv', () => {
  it('carries MCP public base URL into provider config', () => {
    const config = loadBetterAuthProviderConfigFromEnv({
      PUBLIC_ORIGIN: 'https://app.owox.test',
      MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com/',
      IDP_OWOX_DB_TYPE: 'sqlite',
      IDP_OWOX_SQLITE_DB_PATH: ':memory:',
      IDP_OWOX_CLIENT_BASE_URL: 'https://idp.owox.test',
      IDP_OWOX_CLIENT_BACKCHANNEL_PREFIX: '/internal',
      IDP_OWOX_C2C_SERVICE_ACCOUNT: 'service@example.iam.gserviceaccount.com',
      IDP_OWOX_C2C_TARGET_AUDIENCE: 'https://idp.owox.test',
      IDP_OWOX_CLIENT_ID: 'client-1',
      IDP_OWOX_PLATFORM_SIGN_IN_URL: 'https://platform.owox.test/sign-in',
      IDP_OWOX_PLATFORM_SIGN_UP_URL: 'https://platform.owox.test/sign-up',
      IDP_OWOX_JWT_ISSUER: 'https://idp.owox.test',
      IDP_BETTER_AUTH_SECRET: 'x'.repeat(40),
      SENDGRID_API_KEY: 'sendgrid-key',
      IDP_OWOX_SENDGRID_VERIFIED_SENDER_EMAIL: 'noreply@owox.test',
    });

    expect(config.mcp).toEqual({ publicBaseUrl: 'https://mcp.owox.com' });
  });
});
