import * as crypto from 'crypto';
import {
  IIdpProvider,
  CreateUserDto,
  UpdateUserDto,
  MagicLink,
  CreateProjectDto,
} from './types/interfaces.js';
import { TokenService } from './services/token.service.js';
import { KeyService } from './services/key.service.js';
import { IdpConfig } from './types/config.js';
import {
  User,
  AuthTokens,
  Project,
  MagicLinkPayload,
  TokenPayload,
  KeyPair,
} from './types/types.js';
import { AuthenticationError, AuthResult, SignInCredentials } from './types/interfaces.js';
import { Algorithm } from './types/enums.js';

export abstract class BaseIdpProvider implements IIdpProvider {
  protected tokenService: TokenService;
  protected keyService: KeyService;

  constructor(protected config: IdpConfig) {
    this.keyService = new KeyService(config.keyStorage, config.algorithm || Algorithm.RS256);

    this.tokenService = new TokenService(this.keyService, {
      issuer: config.issuer || 'owox-idp',
      audience: config.audience || 'owox-app',
      accessTokenTTL: config.accessTokenTTL || 900, // 15 minutes
      refreshTokenTTL: config.refreshTokenTTL || 604800, // 7 days
    });
  }

  // Abstract

  // User
  abstract createUser(data: CreateUserDto): Promise<User>;
  abstract getUser(id: string): Promise<User | null>;
  abstract getUserByEmail(email: string): Promise<User | null>;
  abstract updateUser(id: string, data: UpdateUserDto): Promise<User>;
  abstract deleteUser(id: string): Promise<void>;

  // Project
  abstract createProject(data: CreateProjectDto): Promise<Project>;
  abstract getProject(id: string): Promise<Project | null>;

  // Password
  abstract validatePassword(user: User, password: string): Promise<boolean>;

  // Magic link
  abstract saveMagicLink(magicLink: MagicLinkPayload): Promise<void>;
  abstract getMagicLink(token: string): Promise<MagicLinkPayload | null>;
  abstract markMagicLinkUsed(token: string): Promise<void>;

  // Common implementations
  async signIn(credentials: SignInCredentials): Promise<AuthResult> {
    if (credentials.provider) {
      return this.signInWithProvider(credentials);
    }

    if (!credentials.email || !credentials.password) {
      throw new AuthenticationError('Email and password required');
    }

    const user = await this.getUserByEmail(credentials.email);
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    const isValid = await this.validatePassword(user, credentials.password);
    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.emailVerified && this.config.requireEmailVerification) {
      throw new AuthenticationError('Email not verified');
    }

    const projectId = this.config.defaultProjectId || 'default';
    const tokens = await this.tokenService.generateTokens(user, projectId);

    return {
      user,
      tokens,
      isNewUser: false,
    };
  }

  async signOut(_userId: string): Promise<void> {
    // Implement token revocation if needed
    await this.revokeTokens(_userId);
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.tokenService.refreshTokens(refreshToken);
  }

  async createMagicLink(email: string, _projectId: string): Promise<MagicLink> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (this.config.magicLinkTTL || 3600) * 1000);

    const magicLinkPayload: MagicLinkPayload = {
      email,
      token,
      expiresAt,
      used: false,
    };

    await this.saveMagicLink(magicLinkPayload);

    const baseUrl = this.config.magicLinkBaseUrl || 'http://localhost:3000';
    const url = `${baseUrl}/auth/magic-link?token=${token}`;

    return {
      url,
      token,
      expiresAt,
    };
  }

  async verifyMagicLink(token: string): Promise<AuthResult> {
    const magicLink = await this.getMagicLink(token);

    if (!magicLink) {
      throw new AuthenticationError('Invalid magic link');
    }

    if (magicLink.used) {
      throw new AuthenticationError('Magic link already used');
    }

    if (new Date() > magicLink.expiresAt) {
      throw new AuthenticationError('Magic link expired');
    }

    // Mark as used
    await this.markMagicLinkUsed(token);

    // Get or create user
    let user = await this.getUserByEmail(magicLink.email);
    let isNewUser = false;

    if (!user) {
      user = await this.createUser({
        email: magicLink.email,
        emailVerified: true,
      });
      isNewUser = true;
    } else if (!user.emailVerified) {
      // Verify email if not already verified
      user = await this.updateUser(user.id, { emailVerified: true });
    }

    const projectId = this.config.defaultProjectId || 'default';
    const tokens = await this.tokenService.generateTokens(user, projectId);

    return {
      user,
      tokens,
      isNewUser,
    };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.tokenService.verifyToken(token);
  }

  async revokeTokens(_userId: string): Promise<void> {
    // TODO: Implement token revocation
  }

  async rotateKeys(): Promise<KeyPair> {
    return this.keyService.rotateKeys();
  }

  async getPublicKey(kid?: string): Promise<string> {
    if (kid) {
      const keyPair = await this.config.keyStorage?.getKeyPair(kid);
      if (!keyPair) {
        throw new Error(`Key with id ${kid} not found`);
      }
      return keyPair.publicKey;
    }

    const keyPair = await this.keyService.getActiveKeyPair();
    return keyPair.publicKey;
  }

  protected async signInWithProvider(_credentials: SignInCredentials): Promise<AuthResult> {
    // TODO: Implement provider sign-in
    throw new Error('Provider sign-in not implemented');
  }
}
