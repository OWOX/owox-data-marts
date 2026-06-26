import { jest } from '@jest/globals';
import { OWOXApiError, OWOXAuthError, OWOXConfigError } from '@owox/api-client';

import { renderJson } from '../output.js';
import { getMissingConfigStatus, getStatus } from './status.js';

describe('status', () => {
  const apiKey = `owox_key_${Buffer.from(
    JSON.stringify({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value-that-must-not-leak',
    }),
    'utf8'
  ).toString('base64url')}`;

  it('includes API key auth context and never prints the secret', async () => {
    const status = await getStatus(
      {
        apiKey,
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate: async () => undefined,
          auth: {
            getContext: async () => ({
              apiKeyId: 'pmk_ContextShouldNotOverrideConfig',
              authFlow: 'api_key',
              project: {
                id: 'project-1',
                title: 'Demo Project',
              },
              member: {
                userId: 'user-1',
                email: 'analyst@example.com',
                fullName: 'Data Analyst',
                avatar: null,
                roles: ['admin'],
              },
            }),
          },
        }),
      }
    );

    expect(status).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      authenticated: true,
      envFile: '/work/.env',
      project: {
        id: 'project-1',
        title: 'Demo Project',
      },
      member: {
        userId: 'user-1',
        email: 'analyst@example.com',
        fullName: 'Data Analyst',
        avatar: null,
        roles: ['admin'],
      },
    });

    expect(renderJson(status)).not.toContain('secret-value-that-must-not-leak');
    expect(renderJson(status)).not.toContain(apiKey);
    expect(renderJson(status)).not.toContain('"authFlow"');
  });

  it('uses null envFile when no env file was loaded', async () => {
    await expect(
      getStatus(
        {
          apiKey,
          apiOrigin: 'https://app.owox.com',
          apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        },
        null,
        {
          createClient: () => ({
            authenticate: async () => undefined,
            auth: {
              getContext: async () => ({
                apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
                authFlow: 'api_key',
                project: {
                  id: 'project-1',
                  title: 'Demo Project',
                },
                member: {
                  userId: 'user-1',
                  email: 'analyst@example.com',
                  fullName: 'Data Analyst',
                  avatar: null,
                  roles: ['viewer'],
                },
              }),
            },
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
      new OWOXConfigError('OWOX_API_KEY is required and must start with owox_key_')
    );

    expect(status).toEqual({
      apiOrigin: null,
      apiKeyId: null,
      authenticated: false,
      envFile: null,
      error: {
        message: 'OWOX_API_KEY is required and must start with owox_key_',
        name: 'OWOXConfigError',
      },
    });
  });

  it('returns authenticated false with API key ID when authentication fails', async () => {
    const status = await getStatus(
      {
        apiKey,
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate: async () => undefined,
          auth: {
            getContext: async () => {
              throw new OWOXAuthError('Unauthorized', { status: 401, code: 'INVALID_API_KEY' });
            },
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
    expect(renderJson(status)).not.toContain(apiKey);
  });

  it('falls back to exchange-only authentication when auth context is not available', async () => {
    const authenticate = jest.fn().mockResolvedValue(undefined);

    const status = await getStatus(
      {
        apiKey,
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate,
          auth: {
            getContext: async () => {
              throw new OWOXApiError('Not found', { status: 404 });
            },
          },
        }),
      }
    );

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(status).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      authenticated: true,
      envFile: '/work/.env',
    });
  });

  it('does not use exchange-only fallback for auth failures with 404 status', async () => {
    const authenticate = jest.fn().mockResolvedValue(undefined);

    const status = await getStatus(
      {
        apiKey,
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate,
          auth: {
            getContext: async () => {
              throw new OWOXAuthError('Not found', { status: 404, code: 'NOT_FOUND' });
            },
          },
        }),
      }
    );

    expect(authenticate).not.toHaveBeenCalled();
    expect(status).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      authenticated: false,
      envFile: '/work/.env',
      error: {
        message: 'Not found',
        name: 'OWOXAuthError',
        status: 404,
        code: 'NOT_FOUND',
      },
    });
  });

  it('returns authenticated false when exchange-only fallback fails', async () => {
    const status = await getStatus(
      {
        apiKey,
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
      '/work/.env',
      {
        createClient: () => ({
          authenticate: async () => {
            throw new OWOXAuthError('Unauthorized', { status: 401, code: 'INVALID_API_KEY' });
          },
          auth: {
            getContext: async () => {
              throw new OWOXApiError('Not found', { status: 404 });
            },
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
  });
});
