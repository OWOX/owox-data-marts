import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators/reject-api-key-auth.decorator';
import { ProjectMemberApiKeysController } from './project-member-api-keys.controller';

describe('ProjectMemberApiKeysController', () => {
  it.each(['list', 'create', 'update', 'revoke'] as const)(
    'rejects API-key authentication for %s',
    methodName => {
      expect(
        Reflect.getMetadata(
          REJECT_API_KEY_AUTH_METADATA,
          ProjectMemberApiKeysController.prototype[methodName]
        )
      ).toBe(true);
    }
  );
});
