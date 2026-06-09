import { ProjectMemberApiKeyCodecService } from './project-member-api-key-codec.service';
import { decodeProjectMemberApiKey } from '../../../test/utils/project-member-api-key-codec';

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

    expect(decodeProjectMemberApiKey(apiKey)).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value',
    });
  });
});
