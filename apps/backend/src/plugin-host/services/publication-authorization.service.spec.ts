import { ConfigService } from '@nestjs/config';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PublicationAuthorizationError } from '../errors/plugin-host.errors';
import { PublicationAuthorizationService } from './publication-authorization.service';

function service(allowlist = ''): PublicationAuthorizationService {
  const configService = {
    get: <T>(key: string) =>
      (key === 'OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS' ? allowlist : undefined) as T,
  } as ConfigService;

  return new PublicationAuthorizationService(
    new PluginHostConfigService(configService, new PublicOriginService(configService))
  );
}

const ctx = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
  projectId: 'j1',
  userId: 'u1',
  roles: ['viewer'],
  ...overrides,
});

describe('PublicationAuthorizationService', () => {
  describe('deployment scope', () => {
    it('admits an allowlisted api key', () => {
      expect(() =>
        service('key-1,key-2').assertMayManage(
          PluginPublicationScope.DEPLOYMENT,
          ctx({ apiKeyId: 'key-2' })
        )
      ).not.toThrow();
    });

    // Deployment scope is gated on the key, not the role: it stands in for the
    // deployment administration panel the spec deliberately does not build.
    it('refuses a project admin who is not on the allowlist', () => {
      expect(() =>
        service('key-1').assertMayManage(
          PluginPublicationScope.DEPLOYMENT,
          ctx({ roles: ['admin'], apiKeyId: 'key-9' })
        )
      ).toThrow(PublicationAuthorizationError);
    });

    it('refuses a browser session, which carries no api key at all', () => {
      expect(() =>
        service('key-1').assertMayManage(
          PluginPublicationScope.DEPLOYMENT,
          ctx({ roles: ['admin'] })
        )
      ).toThrow(PublicationAuthorizationError);
    });

    // An unset allowlist must deny everyone. Reading it as "unrestricted" would hand
    // deployment-wide publishing to every api key on the deployment.
    it('refuses everyone when the allowlist is empty', () => {
      expect(() =>
        service('').assertMayManage(PluginPublicationScope.DEPLOYMENT, ctx({ apiKeyId: 'key-1' }))
      ).toThrow(PublicationAuthorizationError);
    });

    it('reports the scope so callers can explain what was refused', () => {
      try {
        service('').assertMayManage(PluginPublicationScope.DEPLOYMENT, ctx());
        fail('expected a throw');
      } catch (error) {
        expect(error).toMatchObject({
          code: 'PLUGIN_PUBLICATION_FORBIDDEN',
          errorDetails: { scope: 'deployment' },
        });
      }
    });
  });

  describe('project scope', () => {
    it('admits a project admin', () => {
      expect(() =>
        service().assertMayManage(PluginPublicationScope.PROJECT, ctx({ roles: ['admin'] }))
      ).not.toThrow();
    });

    it.each([[['editor']], [['viewer']], [[]], [undefined]])(
      'refuses roles %p',
      (roles: string[] | undefined) => {
        expect(() =>
          service().assertMayManage(
            PluginPublicationScope.PROJECT,
            ctx({ roles: roles as AuthorizationContext['roles'] })
          )
        ).toThrow(PublicationAuthorizationError);
      }
    );
  });

  describe('member scope', () => {
    it('admits any project member, including a viewer', () => {
      expect(() =>
        service().assertMayManage(PluginPublicationScope.MEMBER, ctx({ roles: ['viewer'] }))
      ).not.toThrow();
    });

    it('still requires an identified member', () => {
      expect(() =>
        service().assertMayManage(PluginPublicationScope.MEMBER, ctx({ userId: '' }))
      ).toThrow(PublicationAuthorizationError);
    });
  });

  describe('isDeploymentPublisher', () => {
    it('is a plain predicate for callers that branch rather than throw', () => {
      expect(service('key-1').isDeploymentPublisher(ctx({ apiKeyId: 'key-1' }))).toBe(true);
      expect(service('key-1').isDeploymentPublisher(ctx({ apiKeyId: 'key-2' }))).toBe(false);
      expect(service('key-1').isDeploymentPublisher(ctx())).toBe(false);
    });
  });
});
