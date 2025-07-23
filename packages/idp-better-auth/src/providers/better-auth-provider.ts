import {
  type CreateUserDto,
  type UpdateUserDto,
  type CreateProjectDto,
  type SignInCredentials,
  type AuthResult,
  type User,
  type Project,
  type MagicLinkPayload,
  type IdpConfig,
  type IdpTokens,
  type TokenPayload,
  type IdpCapabilities,
  AuthenticationError,
  InvalidTokenError,
  BaseIdpProvider,
} from '@owox/idp-protocol';
import { createBetterAuthConfig } from '../config/better-auth.config.js';
import { type BetterAuthConfig } from '../types/index.js';

export class BetterAuthProvider extends BaseIdpProvider {
  private auth: Awaited<ReturnType<typeof createBetterAuthConfig>>;

  private constructor(
    config: IdpConfig,
    auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    capabilities?: Partial<IdpCapabilities>
  ) {
    super(config, capabilities);
    this.auth = auth;
  }

  static async create(
    config: IdpConfig,
    betterAuthConfig: BetterAuthConfig,
    capabilities?: Partial<IdpCapabilities>
  ): Promise<BetterAuthProvider> {
    const auth = await createBetterAuthConfig(betterAuthConfig);

    // Define Better Auth default capabilities
    const defaultCapabilities: Partial<IdpCapabilities> = {
      authPages: {
        signIn: true,
        signOut: true,
        signUp: true,
        magicLink: betterAuthConfig.magicLink?.enabled ?? false,
        socialAuth: {
          google: !!betterAuthConfig.socialProviders?.google,
          microsoft: !!betterAuthConfig.socialProviders?.github, // Using github as microsoft placeholder
        },
        emailVerification: betterAuthConfig.emailAndPassword?.requireEmailVerification ?? false,
        passwordReset: true, // Better Auth supports this
      },
      authApi: {
        tokenRefresh: true, // We can implement via session management
        tokenRevoke: true,
        tokenIntrospection: true,
      },
      managementApi: {
        users: {
          read: true,
          create: true,
          update: true,
          delete: true,
          list: false, // Would need custom implementation
        },
        projects: {
          // Better Auth doesn't have projects, so all false
        },
        roles: {
          // Better Auth has basic role support
        },
        sessions: {
          list: false, // Would need custom implementation
          revoke: true,
        },
        health: true,
      },
    };

    // Merge with provided capabilities
    const mergedCapabilities = capabilities
      ? { ...defaultCapabilities, ...capabilities }
      : defaultCapabilities;

    return new BetterAuthProvider(config, auth, mergedCapabilities);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    try {
      const result = await this.auth.api.signUpEmail({
        body: {
          email: data.email,
          password: data.password || Math.random().toString(36).substring(2, 15),
          name: data.name || '',
        },
      });

      const user = (result as any)?.user || result;
      if (!user) {
        throw new Error('Failed to create user');
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        emailVerified: user.emailVerified || false,
        createdAt: new Date(user.createdAt || Date.now()),
        updatedAt: new Date(user.updatedAt || Date.now()),
      };
    } catch (error) {
      throw new Error(`Failed to create user: ${error}`);
    }
  }

  async getUser(_id: string): Promise<User | null> {
    // not provide this method in better auth. Need to implement this directly in the database
    return null;
  }

  async getUserByEmail(_email: string): Promise<User | null> {
    // not provide this method in better auth. Need to implement this directly in the database
    return null;
  }

  async updateUser(_id: string, data: UpdateUserDto): Promise<User> {
    try {
      const result = await this.auth.api.updateUser({
        body: {
          name: data.name,
          image: undefined,
        },
      });

      const user = (result as any)?.user || result;
      if (!user) {
        throw new Error('Failed to update user');
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        emailVerified: user.emailVerified || false,
        createdAt: new Date(user.createdAt || Date.now()),
        updatedAt: new Date(user.updatedAt || Date.now()),
      };
    } catch (error) {
      throw new Error(`Failed to update user: ${error}`);
    }
  }

  async deleteUser(_id: string): Promise<void> {
    try {
      await this.auth.api.deleteUser({
        body: {},
      });
    } catch (error) {
      throw new Error(`Failed to delete user: ${error}`);
    }
  }

  async createProject(_data: CreateProjectDto): Promise<Project> {
    throw new Error('Project management not implemented in Better Auth provider');
  }

  async getProject(_id: string): Promise<Project | null> {
    throw new Error('Project management not implemented in Better Auth provider');
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    try {
      const result = await this.auth.api.signInEmail({
        body: {
          email: user.email,
          password,
        },
      });

      return !!(result as any)?.user;
    } catch (error) {
      return false;
    }
  }

  async saveMagicLink(_magicLink: MagicLinkPayload): Promise<void> {
    // Better Auth handles magic links internally via the plugin
  }

  async getMagicLink(_token: string): Promise<MagicLinkPayload | null> {
    // Better Auth handles magic links internally via the plugin
    return null;
  }

  async markMagicLinkUsed(_token: string): Promise<void> {
    // Better Auth handles magic links internally via the plugin
  }

  async signIn(credentials: SignInCredentials): Promise<AuthResult> {
    try {
      let result: any;

      if (credentials.provider === 'google' || credentials.provider === 'microsoft') {
        // OAuth providers need to be handled on the frontend via redirects
        throw new AuthenticationError('OAuth providers should be handled via frontend redirects');
      } else {
        // Email/password sign in
        if (!credentials.email || !credentials.password) {
          throw new AuthenticationError('Email and password required');
        }

        result = await this.auth.api.signInEmail({
          body: {
            email: credentials.email,
            password: credentials.password,
          },
        });
      }

      const user = (result as any)?.user;
      const session = (result as any)?.session;

      if (!user) {
        throw new AuthenticationError('Sign in failed');
      }

      const userData: User = {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        emailVerified: user.emailVerified || false,
        createdAt: new Date(user.createdAt || Date.now()),
        updatedAt: new Date(user.updatedAt || Date.now()),
      };

      const tokens: IdpTokens = {
        accessToken: session?.token || '',
        tokenType: 'Bearer',
        expiresIn: session
          ? Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
          : 3600,
        sessionId: session?.id,
      };

      return {
        user: userData,
        tokens,
        isNewUser: false,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Sign in failed: ${error}`);
    }
  }

  // implement this
  async signOut(_userId: string): Promise<void> {
    try {
      await this.auth.api.signOut({
        headers: {},
      });
    } catch (error) {
      throw new Error(`Sign out failed: ${error}`);
    }
  }

  async introspectToken(token: string): Promise<TokenPayload> {
    try {
      const result = await this.auth.api.getSession({
        headers: new Headers({
          cookie: `better-auth.session_token=${token}`,
        }),
      });

      const user = (result as any)?.user;
      const session = (result as any)?.session;

      if (!user || !session) {
        throw new InvalidTokenError('Invalid or expired token');
      }

      // Check if session is expired
      if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
        throw new InvalidTokenError('Token has expired');
      }

      return {
        sub: user.id,
        email: user.email,
        roles: user.roles || [], // Extract roles from Better Auth user if available
        permissions: user.permissions || [], // Extract permissions if available
        projectId: this.config.defaultProjectId || 'default',
        iat: Math.floor(new Date(session.createdAt || Date.now()).getTime() / 1000),
        exp: Math.floor(new Date(session.expiresAt || Date.now() + 3600000).getTime() / 1000),
        aud: this.config.audience || 'owox-app',
        iss: this.config.issuer || 'owox-idp',
      };
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError(`Token introspection failed: ${error}`);
    }
  }

  async revokeTokens(userId: string): Promise<void> {
    try {
      // Better Auth doesn't have a direct revoke all sessions API
      // We need to get the user's sessions and revoke them
      // For now, we'll implement a basic sign out which should invalidate the current session
      await this.signOut(userId);
    } catch (error) {
      throw new Error(`Failed to revoke tokens for user ${userId}: ${error}`);
    }
  }

  async createMagicLink(email: string, _projectId: string) {
    try {
      // Better Auth magic link plugin handles creation and sending automatically
      // The actual sending is handled by the sendMagicLink callback in config
      // Here we just return metadata since Better Auth manages the token internally
      return {
        url: `${this.config.magicLinkBaseUrl}/auth/magic-link?email=${encodeURIComponent(email)}`,
        token: 'handled-by-better-auth-plugin',
        expiresAt: new Date(Date.now() + (this.config.magicLinkTTL || 3600) * 1000),
      };
    } catch (error) {
      throw new Error(`Failed to create magic link: ${error}`);
    }
  }

  async verifyMagicLink(_token: string): Promise<AuthResult> {
    // Better Auth magic link plugin handles verification automatically
    // when users click the magic link. This should not be called directly.
    throw new AuthenticationError(
      'Magic link verification is handled automatically by Better Auth plugin when users click the link'
    );
  }

  getBetterAuth(): any {
    return this.auth;
  }

  async getCurrentSession(sessionToken: string) {
    try {
      return await this.auth.api.getSession({
        headers: new Headers({
          cookie: `better-auth.session_token=${sessionToken}`,
        }),
      });
    } catch (error) {
      return null;
    }
  }

  // Helper method for handling OAuth redirects
  getOAuthUrl(provider: 'google' | 'microsoft', redirectUrl?: string) {
    const baseUrl = this.config.magicLinkBaseUrl || 'http://localhost:3000';
    const callbackUrl = redirectUrl || `${baseUrl}/auth/callback`;
    return `${baseUrl}/api/auth/sign-in/${provider}?callbackURL=${encodeURIComponent(callbackUrl)}`;
  }
}
