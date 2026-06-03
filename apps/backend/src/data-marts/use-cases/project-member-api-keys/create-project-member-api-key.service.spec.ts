import { PublicOriginService } from '../../../common/config/public-origin.service';
import type { ProjectMemberApiKeyMetadata } from '../../../project-member-api-keys/dto/domain/project-member-api-key-metadata.dto';
import { ProjectMemberApiKeyCodecService } from '../../../project-member-api-keys/services/project-member-api-key-codec.service';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';
import { CreateProjectMemberApiKeyCommand } from '../../dto/domain/create-project-member-api-key.command';
import { CreateProjectMemberApiKeyService } from './create-project-member-api-key.service';

describe('CreateProjectMemberApiKeyService', () => {
  const metadata: ProjectMemberApiKeyMetadata = {
    apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    projectId: 'project-1',
    userId: 'user-1',
    name: 'CI import job',
    role: null,
    readOnly: false,
    expiresAt: null,
    revokedAt: null,
    lastAuthenticatedAt: null,
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    modifiedAt: new Date('2026-06-03T00:00:00.000Z'),
  };

  const createService = () => {
    const apiKeyService = {
      createForMember: jest.fn().mockResolvedValue({
        metadata,
        secret: 'secret-value',
      }),
    } as unknown as jest.Mocked<ProjectMemberApiKeyService>;
    const codecService = new ProjectMemberApiKeyCodecService();
    const publicOriginService = {
      getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
    } as unknown as jest.Mocked<PublicOriginService>;
    const service = new CreateProjectMemberApiKeyService(
      apiKeyService,
      codecService,
      publicOriginService
    );

    return { service, apiKeyService, publicOriginService };
  };

  it('creates a key and returns one result with metadata and the encoded API key', async () => {
    const { service, apiKeyService, publicOriginService } = createService();

    const result = await service.run(
      new CreateProjectMemberApiKeyCommand('project-1', 'user-1', 'CI import job', null, null)
    );

    expect(apiKeyService.createForMember).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'CI import job',
      null,
      false,
      null
    );
    expect(publicOriginService.getPublicOrigin).toHaveBeenCalled();
    expect(result.apiKeyId).toBe('pmk_AbCdEfGhIjKlMnOpQrStUv');
    expect(result.apiKey).toMatch(/^owox_key_[A-Za-z0-9_-]+$/);
    expect(result).not.toHaveProperty('apiKeySecret');

    const payload = JSON.parse(
      Buffer.from(result.apiKey.slice('owox_key_'.length), 'base64url').toString('utf8')
    ) as unknown;
    expect(payload).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value',
    });
  });
});
