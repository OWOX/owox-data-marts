import { createBetterAuthConfig } from '../auth/auth-config.js';
import { CryptoService } from './crypto-service.js';
import { Payload, AuthResult } from '@owox/idp-protocol';

export class TokenService {
  private static readonly DEFAULT_ORGANIZATION_ID = 'owox-default';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly cryptoService: CryptoService
  ) {}

  async introspectToken(token: string): Promise<Payload | null> {
    try {
      const cleanToken = token.replace('Bearer ', '');
      const decryptedToken = await this.cryptoService.decrypt(cleanToken);

      const encodedToken = encodeURIComponent(decryptedToken);
      const session = await this.auth.api.getSession({
        headers: new Headers({
          Cookie: `refreshToken=${encodedToken}`,
        }),
      });

      if (!session || !session.user) {
        return null;
      }

      return {
        userId: session.user.id,
        projectId: TokenService.DEFAULT_ORGANIZATION_ID,
        email: session.user.email,
        fullName: session.user.name || session.user.email,
        roles: ['admin'],
      };
    } catch (error) {
      console.error('Token introspection failed:', error);
      throw new Error('Token introspection failed');
    }
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.introspectToken(token);
  }

  async verifyToken(token: string): Promise<Payload | null> {
    try {
      const cleanToken = token.replace('Bearer ', '');
      const decryptedToken = await this.cryptoService.decrypt(cleanToken);

      const session = await this.auth.api.getSession({
        headers: new Headers({
          Authorization: `Bearer ${decryptedToken}`,
          Cookie: `refreshToken=${decryptedToken}`,
        }),
      });

      if (!session || !session.user) {
        return null;
      }

      return {
        userId: session.user.id,
        projectId: TokenService.DEFAULT_ORGANIZATION_ID,
        email: session.user.email,
        fullName: session.user.name || session.user.email,
        roles: ['admin'],
      };
    } catch (error) {
      console.error('Token verification failed:', error);
      throw new Error('Token verification failed');
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // TODO: decode refresh token
      const session = await this.auth.api.getSession({
        headers: new Headers({
          Cookie: `refreshToken=${refreshToken}`,
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
      console.error('Token refresh failed:', error);
      throw new Error('Token refresh failed');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const cleanToken = token.replace('Bearer ', '');
      const decryptedToken = await this.cryptoService.decrypt(cleanToken);

      const session = await this.auth.api.getSession({
        headers: new Headers({
          Authorization: `Bearer ${decryptedToken}`,
          Cookie: `refreshToken=${decryptedToken}`,
        }),
      });

      if (session) {
        await this.auth.api.signOut({
          headers: new Headers({
            Cookie: `refreshToken=${decryptedToken}`,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to revoke token:', error);
      throw new Error('Failed to revoke token');
    }
  }
}
