import { createBetterAuthConfig } from '../auth/auth-config.js';
import { CryptoService } from './crypto-service.js';
import { Payload, AuthResult, Role } from '@owox/idp-protocol';
import type { UserManagementService } from './user-management-service.js';
import { logger } from '../logger.js';

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
      const decryptedToken = await this.cryptoService.decrypt(cleanToken);

      const encodedToken = encodeURIComponent(decryptedToken);
      const betterAuthTokenPrefix = this.auth.options.advanced?.cookies?.session_token?.attributes
        ?.secure
        ? '__Secure-'
        : '';
      const session = await this.auth.api.getSession({
        headers: new Headers({
          Cookie: `${betterAuthTokenPrefix}refreshToken=${encodedToken}`,
        }),
      });

      if (!session || !session.user) {
        return null;
      }

      // Get the user role from the database
      const userRole = await this.userManagementService.getUserRole(session.user.id);

      const payload: Payload = {
        userId: session.user.id,
        projectId: TokenService.DEFAULT_ORGANIZATION_ID,
        email: session.user.email,
        fullName: session.user.name || session.user.email,
      };

      // Only include the role if the user has a role assigned
      if (userRole) {
        payload.roles = [userRole as Role];
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

      const encryptedToken = await this.cryptoService.encrypt(session.session.token);
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
