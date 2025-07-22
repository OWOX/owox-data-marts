import * as crypto from 'crypto';
import { IIdpProvider } from './types/provider.js';
import {
  CreateUserDto,
  UpdateUserDto,
  MagicLink,
  CreateProjectDto,
  AuthResult,
  SignInCredentials,
} from './types/dto.js';
import { User, Project, TokenPayload, MagicLinkPayload } from './types/models.js';
import { AuthenticationError } from './types/errors.js';
import { IdpConfig } from './types/config.js';
import { IdpCapabilities, DEFAULT_CAPABILITIES } from './types/capabilities.js';

export abstract class BaseIdpProvider implements IIdpProvider {
  protected capabilities: IdpCapabilities;

  constructor(
    protected config: IdpConfig,
    capabilities?: Partial<IdpCapabilities>
  ) {
    // Merge provided capabilities with defaults
    this.capabilities = this.mergeCapabilities(DEFAULT_CAPABILITIES, capabilities || {});
  }

  /**
   * Get the capabilities of this IDP provider
   */
  getCapabilities(): IdpCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if a specific capability is supported
   */
  hasCapability(capability: string): boolean {
    const parts = capability.split('.');
    let current: any = this.capabilities;

    for (const part of parts) {
      if (current[part] === undefined) return false;
      current = current[part];
    }

    return Boolean(current);
  }

  /**
   * Merge capabilities with defaults
   */
  private mergeCapabilities(
    defaults: IdpCapabilities,
    custom: Partial<IdpCapabilities>
  ): IdpCapabilities {
    return {
      authPages: { ...defaults.authPages, ...custom.authPages },
      authApi: { ...defaults.authApi, ...custom.authApi },
      managementApi: {
        users: { ...defaults.managementApi.users, ...custom.managementApi?.users },
        projects: { ...defaults.managementApi.projects, ...custom.managementApi?.projects },
        roles: { ...defaults.managementApi.roles, ...custom.managementApi?.roles },
        sessions: { ...defaults.managementApi.sessions, ...custom.managementApi?.sessions },
        health: custom.managementApi?.health ?? defaults.managementApi.health,
      },
    };
  }

  // Abstract methods that each IDP implementation must provide

  // User management
  abstract createUser(data: CreateUserDto): Promise<User>;
  abstract getUser(id: string): Promise<User | null>;
  abstract getUserByEmail(email: string): Promise<User | null>;
  abstract updateUser(id: string, data: UpdateUserDto): Promise<User>;
  abstract deleteUser(id: string): Promise<void>;

  // Project management
  abstract createProject(data: CreateProjectDto): Promise<Project>;
  abstract getProject(id: string): Promise<Project | null>;

  // Authentication (returns IDP-specific tokens)
  abstract signIn(credentials: SignInCredentials): Promise<AuthResult>;
  abstract signOut(userId: string): Promise<void>;

  // Token introspection - parse IDP token to protocol DTO
  abstract introspectToken(token: string): Promise<TokenPayload>;
  abstract revokeTokens(userId: string): Promise<void>;

  // Magic link support
  abstract saveMagicLink(magicLink: MagicLinkPayload): Promise<void>;
  abstract getMagicLink(token: string): Promise<MagicLinkPayload | null>;
  abstract markMagicLinkUsed(token: string): Promise<void>;

  // Common magic link implementation
  async createMagicLink(email: string, projectId: string): Promise<MagicLink> {
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

    // Use sign in to get IDP-specific tokens
    const authResult = await this.signIn({
      email: user.email,
      // Magic link validation - implementation specific
    });

    return {
      ...authResult,
      isNewUser,
    };
  }
}
