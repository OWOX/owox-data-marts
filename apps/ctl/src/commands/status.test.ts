import { OWOXAuthError, OWOXConfigError } from '@owox/api-client';

import { DEFAULT_API_ORIGIN } from '../config-store.js';
import { renderJson } from '../output.js';
import { getMissingConfigStatus, getStatus } from './status.js';

describe('status', () => {
  it('includes API key ID, includes envFile, and never prints the secret', async () => {
    const status = await getStatus(
      {
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: 'secret-value-that-must-not-leak',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate: async () => undefined,
        }),
      }
    );

    expect(status).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      authenticated: true,
      envFile: '/work/.env',
    });

    expect(renderJson(status)).not.toContain('secret-value-that-must-not-leak');
  });

  it('uses null envFile when no env file was loaded', async () => {
    await expect(
      getStatus(
        {
          apiOrigin: 'https://app.owox.com',
          apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
          apiKeySecret: 'secret-value-that-must-not-leak',
        },
        null,
        {
          createClient: () => ({
            authenticate: async () => undefined,
          }),
        }
      )
    ).resolves.toMatchObject({
      authenticated: true,
      envFile: null,
    });
  });

  it('returns authenticated false when credential variables are missing', () => {
    const status = getMissingConfigStatus(
      {},
      null,
      new OWOXConfigError('OWOX_API_KEY_ID and OWOX_API_KEY_SECRET are required')
    );

    expect(status).toEqual({
      apiOrigin: DEFAULT_API_ORIGIN,
      apiKeyId: null,
      authenticated: false,
      envFile: null,
      error: {
        message: 'OWOX_API_KEY_ID and OWOX_API_KEY_SECRET are required',
        name: 'OWOXConfigError',
      },
    });
  });

  it('returns authenticated false with API key ID when authentication fails', async () => {
    const status = await getStatus(
      {
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: 'secret-value-that-must-not-leak',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate: async () => {
            throw new OWOXAuthError('Unauthorized', { status: 401, code: 'INVALID_API_KEY' });
          },
        }),
      }
    );

    expect(status).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      authenticated: false,
      envFile: '/work/.env',
      error: {
        message: 'Unauthorized',
        name: 'OWOXAuthError',
        status: 401,
        code: 'INVALID_API_KEY',
      },
    });

    expect(renderJson(status)).not.toContain('secret-value-that-must-not-leak');
  });
});
