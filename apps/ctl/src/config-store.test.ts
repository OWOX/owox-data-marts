import { OWOXConfigError } from '@owox/api-client';

import { resolveAuthConfig } from './config-store.js';

const validApiKey = `owox_key_${Buffer.from(
  JSON.stringify({
    apiOrigin: 'https://app.owox.com',
    apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    apiKeySecret: 'env-secret',
  }),
  'utf8'
).toString('base64url')}`;

describe('auth config', () => {
  it('parses the combined OWOX API key', () => {
    expect(
      resolveAuthConfig({
        OWOX_API_KEY: validApiKey,
      })
    ).toEqual({
      apiKey: validApiKey,
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'env-secret',
    });
  });

  it('requires the combined OWOX API key', () => {
    expect(() => resolveAuthConfig({})).toThrow(OWOXConfigError);
    expect(() => resolveAuthConfig({})).toThrow('OWOX_API_KEY is required');
  });

  it('does not accept legacy split credential variables', () => {
    expect(() =>
      resolveAuthConfig({
        OWOX_API_ORIGIN: 'https://app.owox.com',
        OWOX_API_KEY_ID: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        OWOX_API_KEY_SECRET: 'env-secret',
      })
    ).toThrow('OWOX_API_KEY is required');
  });

  it('reports invalid combined keys with a safe config error', () => {
    expect(() =>
      resolveAuthConfig({
        OWOX_API_KEY: 'not-an-owox-key',
      })
    ).toThrow('OWOX_API_KEY is required');
  });
});
