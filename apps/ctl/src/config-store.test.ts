import { OWOXConfigError } from '@owox/api-client';

import { DEFAULT_API_ORIGIN, resolveAuthConfig } from './config-store.js';

describe('auth config', () => {
  it('defaults API origin to OWOX Data Marts Cloud', () => {
    expect(
      resolveAuthConfig({
        OWOX_API_KEY_ID: 'pmk_env',
        OWOX_API_KEY_SECRET: 'env-secret',
      })
    ).toEqual({
      apiOrigin: DEFAULT_API_ORIGIN,
      apiKeyId: 'pmk_env',
      apiKeySecret: 'env-secret',
    });
  });

  it('uses explicit API origin when provided', () => {
    expect(
      resolveAuthConfig({
        OWOX_API_ORIGIN: 'https://self-managed.example',
        OWOX_API_KEY_ID: 'pmk_env',
        OWOX_API_KEY_SECRET: 'env-secret',
      })
    ).toEqual({
      apiOrigin: 'https://self-managed.example',
      apiKeyId: 'pmk_env',
      apiKeySecret: 'env-secret',
    });
  });

  it('requires API key ID and secret', () => {
    expect(() => resolveAuthConfig({})).toThrow(OWOXConfigError);
    expect(() => resolveAuthConfig({})).toThrow(
      'OWOX_API_KEY_ID and OWOX_API_KEY_SECRET are required'
    );
  });

  it('reports only the missing credential variable', () => {
    expect(() =>
      resolveAuthConfig({
        OWOX_API_KEY_ID: 'pmk_env',
      })
    ).toThrow('OWOX_API_KEY_SECRET is required');

    expect(() =>
      resolveAuthConfig({
        OWOX_API_KEY_SECRET: 'env-secret',
      })
    ).toThrow('OWOX_API_KEY_ID is required');
  });
});
