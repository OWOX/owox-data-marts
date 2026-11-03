import { describe, expect, it } from '@jest/globals';
import { loadBetterAuthProviderConfigFromEnv } from './idp-owox-config.js';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    PUBLIC_ORIGIN: 'https://app.owox.test',
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
  };
}

describe('loadBetterAuthProviderConfigFromEnv', () => {
  it('carries MCP public base URL into provider config', () => {
    const config = loadBetterAuthProviderConfigFromEnv({
      ...baseEnv(),
      MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com/',
    });

    expect(config.mcp).toEqual({ publicBaseUrl: 'https://mcp.owox.com' });
  });

  it('keeps extension routes disabled unless explicitly enabled', () => {
    const config = loadBetterAuthProviderConfigFromEnv(baseEnv());

    expect(config.idpOwox.extensionAuth).toBeUndefined();
  });

  it('loads exact Microsoft NAA audience, scope and origin allowlists', () => {
    const config = loadBetterAuthProviderConfigFromEnv({
      ...baseEnv(),
      IDP_OWOX_EXTENSION_MICROSOFT_ENABLED: 'true',
      IDP_OWOX_EXTENSION_MICROSOFT_AUDIENCES: 'api://owox-api, owox-api-guid',
      IDP_OWOX_EXTENSION_MICROSOFT_SCOPE: 'identity.exchange',
      IDP_OWOX_EXTENSION_ALLOWED_ORIGINS: 'https://addin.owox.test,https://addin.owox.test/',
    });

    expect(config.idpOwox.extensionAuth).toMatchObject({
      microsoft: {
        allowedAudiences: ['api://owox-api', 'owox-api-guid'],
        requiredScope: 'identity.exchange',
        issuerAuthority: 'https://login.microsoftonline.com',
      },
      allowedOrigins: ['https://addin.owox.test'],
      clockTolerance: '5s',
    });
  });

  it('keeps server-side auth page events off unless a collect URL is set', () => {
    expect(loadBetterAuthProviderConfigFromEnv(baseEnv()).serverEvents).toBeUndefined();
  });

  it('loads server-side auth page events with their measurement id and visitor cookie', () => {
    const config = loadBetterAuthProviderConfigFromEnv({
      ...baseEnv(),
      IDP_OWOX_SERVER_EVENTS_COLLECT_URL: 'https://collector.owox.test/g/collect',
      IDP_OWOX_SERVER_EVENTS_MEASUREMENT_ID: 'G-TEST',
      IDP_OWOX_SERVER_EVENTS_VISITOR_COOKIE: 'vid',
    });

    expect(config.serverEvents).toEqual({
      collectUrl: 'https://collector.owox.test/g/collect',
      measurementId: 'G-TEST',
      visitorCookieName: 'vid',
    });
  });

  it('refuses a server events collect URL without a measurement id and visitor cookie', () => {
    expect(() =>
      loadBetterAuthProviderConfigFromEnv({
        ...baseEnv(),
        IDP_OWOX_SERVER_EVENTS_COLLECT_URL: 'https://collector.owox.test/g/collect',
      })
    ).toThrow();
  });

  it('treats blank server events settings as unset', () => {
    const config = loadBetterAuthProviderConfigFromEnv({
      ...baseEnv(),
      IDP_OWOX_SERVER_EVENTS_COLLECT_URL: '',
      IDP_OWOX_SERVER_EVENTS_MEASUREMENT_ID: ' ',
      IDP_OWOX_SERVER_EVENTS_VISITOR_COOKIE: '',
    });

    expect(config.serverEvents).toBeUndefined();
  });

  it('refuses a server events collect URL that is not https', () => {
    expect(() =>
      loadBetterAuthProviderConfigFromEnv({
        ...baseEnv(),
        IDP_OWOX_SERVER_EVENTS_COLLECT_URL: 'http://collector.owox.test/g/collect',
        IDP_OWOX_SERVER_EVENTS_MEASUREMENT_ID: 'G-TEST',
        IDP_OWOX_SERVER_EVENTS_VISITOR_COOKIE: 'vid',
      })
    ).toThrow();
  });

  it('refuses to enable Microsoft NAA without deployment-owned audience and scope', () => {
    expect(() =>
      loadBetterAuthProviderConfigFromEnv({
        ...baseEnv(),
        IDP_OWOX_EXTENSION_MICROSOFT_ENABLED: 'true',
        IDP_OWOX_EXTENSION_ALLOWED_ORIGINS: 'https://addin.owox.test',
      })
    ).toThrow();
  });
});
