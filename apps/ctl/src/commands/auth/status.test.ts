import { renderJson } from '../../output.js';
import { getAuthStatus } from './status.js';

describe('auth status', () => {
  it('masks API key ID and never prints the secret', async () => {
    const status = await getAuthStatus(
      {
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: 'secret-value-that-must-not-leak',
      },
      {
        createClient: () => ({
          authenticate: async () => undefined,
        }),
      }
    );

    expect(status).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCd...',
      authenticated: true,
    });

    expect(renderJson(status)).not.toContain('secret-value-that-must-not-leak');
  });
});
