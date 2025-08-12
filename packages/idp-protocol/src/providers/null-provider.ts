import { AuthResult, IIdpProvider } from '../types/provider.js';
import { TokenPayload, User, Project } from '../types/models.js';
import { Express } from 'express';

/**
 * NULL IDP Provider - single user, single project
 * Used for deployments without user management and development
 */
export class NullIdpProvider implements IIdpProvider {
  private defaultUser: User;
  private defaultProject: Project;

  constructor() {
    this.defaultProject = {
      id: '0',
      name: 'Default Project',
    };

    this.defaultUser = {
      id: '0',
      email: 'user@localhost',
      name: 'Default User',
    };
  }

  getDefaultUser(): User {
    return this.defaultUser;
  }

  getDefaultProject(): Project {
    return this.defaultProject;
  }

  async initialize(_app: Express): Promise<void> {
    // Nothing to initialize
  }

  async shutdown(): Promise<void> {
    // Nothing to cleanup
  }

  getAuthUrl(_redirectUri: string): string {
    return '';
  }

  async handleCallback(_redirectUri: string, _code: string): Promise<AuthResult> {
    return {
      accessToken: '',
    };
  }

  async signIn(redirectUri: string): Promise<AuthResult> {
    // For NULL provider, sign in is the same as callback
    return this.handleCallback(redirectUri, 'success');
  }

  async refreshToken(_refreshToken: string): Promise<AuthResult> {
    // For NULL provider, refresh is the same as generating new token
    return this.handleCallback('', 'refresh');
  }

  async getUserInfo(_token: string): Promise<User> {
    return this.defaultUser;
  }

  async getProjectInfo(_token: string): Promise<Project> {
    return this.defaultProject;
  }

  async getUserProjects(_token: string): Promise<Project[]> {
    return [this.defaultProject];
  }

  async verifyToken(_token: string): Promise<TokenPayload | null> {
    return {
      sub: '0',
      email: this.defaultUser.email,
      name: this.defaultUser.name,
      roles: ['admin'],
      projectId: this.defaultProject.id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
      iss: 'null-idp',
      aud: 'owox-data-marts',
    };
  }

  async revokeToken(_token: string): Promise<void> {
    // No-op for NULL provider
  }
}
