import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators/reject-api-key-auth.decorator';
import { ProjectMemberApiKeysController } from './project-member-api-keys.controller';

describe('ProjectMemberApiKeysController', () => {
  it('rejects API-key authentication at the controller level', () => {
    expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, ProjectMemberApiKeysController)).toBe(
      true
    );
  });
});
