import {
  API_KEY_PREFIX,
  ProjectMemberApiKeyCodecService,
} from './project-member-api-key-codec.service';

describe('ProjectMemberApiKeyCodecService', () => {
  const service = new ProjectMemberApiKeyCodecService();

  it('encodes the API origin, key id, and secret as an unpadded base64url API key', () => {
    const apiKey = service.encode({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      secret: 'secret-value',
    });

    expect(apiKey).toMatch(/^owox_key_[A-Za-z0-9_-]+$/);
    expect(apiKey).not.toContain('=');

    const payload = JSON.parse(
      Buffer.from(apiKey.slice(API_KEY_PREFIX.length), 'base64url').toString('utf8')
    ) as unknown;
    expect(payload).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value',
    });
  });
});
