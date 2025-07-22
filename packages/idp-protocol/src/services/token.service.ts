import { ITokenService, TokenConfig } from '../types/interfaces.js';
import { KeyService } from './key.service.js';
import { AuthTokens, TokenPayload, User } from '../types/types.js';
import { InvalidTokenError, TokenExpiredError } from '../types/interfaces.js';

export class TokenService implements ITokenService {
  constructor(
    private readonly keyService: KeyService,
    private readonly config: TokenConfig
  ) {}

  async generateTokens(user: User, projectId: string): Promise<AuthTokens> {
    const now = Math.floor(Date.now() / 1000); // current time in seconds

    const basePayload = {
      sub: user.id,
      email: user.email,
      projectId,
      iss: this.config.issuer,
      aud: this.config.audience,
    };

    // Access token - short lived (15 minutes)
    const accessTokenPayload: TokenPayload = {
      ...basePayload,
      roles: await this.getUserRoles(user.id, projectId),
      permissions: await this.getUserPermissions(user.id, projectId),
      iat: now,
      exp: now + this.config.accessTokenTTL, // default 15 minutes
    };

    // Refresh token - long lived
    const refreshTokenPayload = {
      ...basePayload,
      type: 'refresh',
      iat: now,
      exp: now + this.config.refreshTokenTTL, // default 7 days
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.keyService.signToken(accessTokenPayload),
      this.keyService.signToken(refreshTokenPayload),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTTL,
      tokenType: 'Bearer',
    };
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.keyService.verifyToken(token);

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new TokenExpiredError();
      }

      // Validate required claims
      if (!payload.sub || !payload.email || !payload.projectId) {
        throw new InvalidTokenError('Token missing required claims');
      }

      return payload as TokenPayload;
    } catch (error) {
      if (error instanceof TokenExpiredError || error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError('Token verification failed');
    }
  }

  decodeToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString());
      return payload;
    } catch {
      return null;
    }
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyToken(refreshToken);

    // if (!payload.type || payload.type !== 'refresh') {
    //   throw new InvalidTokenError('Invalid refresh token');
    // }

    // Get fresh user data
    const user = await this.getUserById(payload.sub);
    if (!user) {
      throw new InvalidTokenError('User not found');
    }

    return this.generateTokens(user, payload.projectId);
  }

  // These would be implemented by the actual provider
  private async getUserRoles(_userId: string, _projectId: string): Promise<string[]> {
    // Placeholder - actual implementation would query the database
    return ['user'];
  }

  private async getUserPermissions(_userId: string, _projectId: string): Promise<string[]> {
    // Placeholder - actual implementation would query the database
    return [];
  }

  private async getUserById(_userId: string): Promise<User | null> {
    // Placeholder - actual implementation would query the database
    throw new Error('getUserById must be implemented by provider');
  }
}
