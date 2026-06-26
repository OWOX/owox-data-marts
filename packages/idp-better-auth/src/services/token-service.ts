import { createBetterAuthConfig } from '../auth/auth-config.js';
import { CryptoService } from './crypto-service.js';
import { Payload, AuthResult, type Role } from '@owox/idp-protocol';
import type { UserManagementService } from './user-management-service.js';
import { logger } from '../logger.js';

type ProjectMemberApiKeyPayload = Payload & {
  userId: string;
  projectId: string;
  email: string;
  fullName: string;
  roles: [Role];
  authFlow: 'api_key';
  apiKeyId: string;
};

const PROJECT_MEMBER_API_KEY_ROLES: ReadonlySet<Role> = new Set<Role>([
  'admin',
  'editor',
  'viewer',
]);

export class TokenService {
  private static readonly DEFAULT_ORGANIZATION_ID = '0';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly cryptoService: CryptoService,
    private readonly userManagementService: UserManagementService
  ) {}

  async introspectToken(token: string): Promise<Payload | null> {
    try {
      const cleanToken = token.replace('Bearer ', '');
      const decrypted = await this.cryptoService.decrypt(cleanToken);
      const payload = JSON.parse(decrypted) as Payload;

      if (!payload || !payload.userId) {
        return null;
      }

      if (payload.authFlow === 'api_key' && !this.isProjectMemberApiKeyPayload(payload)) {
        return null;
      }

      return payload;
    } catch (error) {
      logger.error('Token introspection failed', {}, error as Error);
      throw new Error('Token introspection failed');
    }
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.introspectToken(token);
  }

  async issueProjectMemberApiKeyAccessToken(
    payload: ProjectMemberApiKeyPayload
  ): Promise<AuthResult> {
    this.assertProjectMemberApiKeyPayload(payload);

    try {
      const encryptedToken = await this.cryptoService.encrypt(JSON.stringify(payload));
      return {
        accessToken: encryptedToken,
      };
    } catch (error) {
      logger.error('Project member API key token issuing failed', {}, error as Error);
      throw new Error('Project member API key token issuing failed');
    }
  }

  private assertProjectMemberApiKeyPayload(
    payload: Payload
  ): asserts payload is ProjectMemberApiKeyPayload {
    if (!this.isProjectMemberApiKeyPayload(payload)) {
      throw new Error('Invalid project member API key token payload');
    }
  }

  private isProjectMemberApiKeyPayload(payload: Payload): payload is ProjectMemberApiKeyPayload {
    const roles = payload.roles;
    const role = Array.isArray(roles) && roles.length === 1 ? roles[0] : undefined;

    return (
      payload.authFlow === 'api_key' &&
      this.isNonEmptyString(payload.userId) &&
      this.isNonEmptyString(payload.projectId) &&
      this.isNonEmptyString(payload.email) &&
      this.isNonEmptyString(payload.fullName) &&
      this.isNonEmptyString(payload.apiKeyId) &&
      role !== undefined &&
      PROJECT_MEMBER_API_KEY_ROLES.has(role)
    );
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const betterAuthTokenPrefix = this.auth.options.advanced?.cookies?.session_token?.attributes
        ?.secure
        ? '__Secure-'
        : '';
      const session = await this.auth.api.getSession({
        headers: new Headers({
          Cookie: `${betterAuthTokenPrefix}refreshToken=${refreshToken}`,
        }),
      });

      if (!session) {
        throw new Error('Invalid refresh token');
      }

      const userRole = await this.userManagementService.getUserRole(session.user.id);

      const payload = {
        userId: session.user.id,
        projectId: TokenService.DEFAULT_ORGANIZATION_ID,
        email: session.user.email,
        fullName: session.user.name || session.user.email,
        ...(userRole ? { roles: [userRole] } : {}),
      };

      const encryptedToken = await this.cryptoService.encrypt(JSON.stringify(payload));
      return {
        accessToken: encryptedToken,
      };
    } catch (error) {
      logger.error('Token refresh failed', {}, error as Error);
      throw new Error('Token refresh failed');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const cleanToken = token.replace('Bearer ', '');
      const decryptedToken = await this.cryptoService.decrypt(cleanToken);
      const betterAuthTokenPrefix = this.auth.options.advanced?.cookies?.session_token?.attributes
        ?.secure
        ? '__Secure-'
        : '';
      const session = await this.auth.api.getSession({
        headers: new Headers({
          Authorization: `Bearer ${decryptedToken}`,
          Cookie: `${betterAuthTokenPrefix}refreshToken=${decryptedToken}`,
        }),
      });

      if (session) {
        await this.auth.api.signOut({
          headers: new Headers({
            Cookie: `${betterAuthTokenPrefix}refreshToken=${decryptedToken}`,
          }),
        });
      }
    } catch (error) {
      logger.error('Failed to revoke token', {}, error as Error);
      throw new Error('Failed to revoke token');
    }
  }
}
