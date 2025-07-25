import {
  AuthResult,
  IdpConfig,
  IIdpMagicLinkManagement,
  IIdpManagement,
  IIdpProvider,
  IIdpRouter,
  IIdpSessionManagement,
  IIdpTokenManagement,
  MagicLink,
  Project,
  SignInCredentials,
  TokenPayload,
  User,
} from '@owox/idp-protocol';
import { createSqliteAdapter } from '../adapters/database.js';
import { createBetterAuthConfig } from '../config/better-auth.config.js';
import { betterAuth, Session } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db';
import { Request } from 'express';

export class BetterAuthProvider implements IIdpProvider {
  private constructor(
    private readonly config: IdpConfig,
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>
  ) {
    this.config = config;
    this.auth = auth;
  }

  static async create(config: IdpConfig): Promise<BetterAuthProvider> {
    const database = await createSqliteAdapter(config.database);
    const auth = betterAuth({
      database,
      plugins: [
        magicLink({
          sendMagicLink: config.magicLink.sendMagicLink,
          expiresIn: config.magicLink.expiresIn || 300, // 5 minutes default
          disableSignUp: config.magicLink.disableSignUp || false,
        }),
      ],
      session: {
        expiresIn: config.session?.maxAge || 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
      },
      trustedOrigins: config.trustedOrigins || ['http://localhost:3000'],
      baseURL: config.baseURL || 'http://localhost:3000',
      secret: config.secret,
      emailAndPassword: {
        enabled: config.emailAndPassword?.enabled || false,
        requireEmailVerification: config.emailAndPassword?.requireEmailVerification || false,
        sendEmailVerification: config.emailAndPassword?.sendEmailVerification || undefined,
      },
      socialProviders: config.socialProviders || undefined,
    });

    return new BetterAuthProvider(config, auth);
  }

  getBetterAuth(): Awaited<ReturnType<typeof betterAuth>> {
    return this.auth;
  }

  async initialize(): Promise<void> {
    // run migrations and compile migrations
    const { runMigrations, compileMigrations } = await getMigrations(this.auth.options);

    await runMigrations();
    await compileMigrations();
  }

  async verifyRequest(req: Request): Promise<void> {
    const session = await this.auth.api.getSession({
      headers: req.headers as unknown as Headers,
      query: req.query as unknown as Record<string, string>,
    });
    if (!session) {
      throw new Error('Unauthorized');
    }
  }

  getRouter(): IIdpRouter {
    return {
      getSignIn: () => Promise.resolve({ path: '/sign-in' }),
      getSignOut: () => Promise.resolve({ path: '/sign-out' }),
      getMagicLinkVerification: () => Promise.resolve({ path: '/magic-link-verification' }),
      getHealthCheck: () => Promise.resolve({ path: '/health-check' }),
    };
  }

  getManagement(): IIdpManagement {
    return {
      getUser: () => Promise.resolve({} as User),
      getUserByEmail: () => Promise.resolve({} as User),
      createUser: () => Promise.resolve({} as User),
      updateUser: () => Promise.resolve({} as User),
      deleteUser: () => Promise.resolve(),
      createProject: () => Promise.resolve({} as Project),
      getProject: () => Promise.resolve({} as Project),
    };
  }

  getTokenManagement(): IIdpTokenManagement {
    return {
      introspect: () => Promise.resolve({} as TokenPayload),
      refresh: () => Promise.resolve({} as AuthResult),
      revoke: () => Promise.resolve(),
    };
  }

  getSessionManagement(): IIdpSessionManagement {
    return {
      getActive: () => Promise.resolve([] as Session[]),
      revoke: () => Promise.resolve(),
      revokeAll: () => Promise.resolve(),
    };
  }

  getMagicLinkManagement(): IIdpMagicLinkManagement {
    return {
      create: () => Promise.resolve({} as MagicLink),
      verify: () => Promise.resolve({} as AuthResult),
    };
  }

  async signIn(credentials: SignInCredentials): Promise<AuthResult> {
    return {
      user: {} as User,
      tokens: {} as AuthResult['tokens'],
    };
  }

  async signOut(userId: string): Promise<void> {
    return;
  }

  async shutdown(): Promise<void> {
    return;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
