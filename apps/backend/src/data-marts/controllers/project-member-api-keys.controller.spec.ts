import { Reflector } from '@nestjs/core';
import { ALLOW_PLUGIN_AUTH_METADATA } from '../../idp/decorators/allow-plugin-auth.decorator';
import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators/reject-api-key-auth.decorator';
import { ProjectMemberApiKeysController } from './project-member-api-keys.controller';

describe('ProjectMemberApiKeysController', () => {
  it('rejects API-key authentication at the controller level', () => {
    expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, ProjectMemberApiKeysController)).toBe(
      true
    );
  });

  /**
   * `create` answers with the full API-key secret, which outlives both a plugin's runtime
   * token and its installation. Under the guard's former default-allow this route was
   * reachable from a plugin through the host bridge; nothing here opts back in.
   */
  it.each(['list', 'create', 'update', 'revoke'] as const)(
    'never opens %s to a plugin runtime token',
    handler => {
      const method = ProjectMemberApiKeysController.prototype[handler] as unknown;

      expect(
        new Reflector().getAllAndOverride<boolean>(ALLOW_PLUGIN_AUTH_METADATA, [
          method as () => unknown,
          ProjectMemberApiKeysController,
        ])
      ).not.toBe(true);
    }
  );
});
