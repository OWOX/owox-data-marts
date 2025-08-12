import { User, Project, TokenPayload, AddUserCommandResponse } from './models.js';
import { Express } from 'express';

/**
 * Simplified IDP Provider interface.
 */
export interface IIdpProvider {
  // Authentication flow
  /**
   * Get the authentication URL for the IDP
   * @param redirectUri - The redirect URI to use for the authentication
   * @returns The authentication URL
   */
  getAuthUrl(redirectUri: string): string;

  /**
   * Handle the callback from the IDP
   * @param redirectUri - The redirect URI to use for the authentication
   * @param code - The code to use for the authentication
   * @returns The authentication result
   */
  handleCallback(redirectUri: string, code: string): Promise<AuthResult>;

  /**
   * Sign in to the IDP
   * @param redirectUri - The redirect URI to use for the authentication
   * @returns The authentication result
   */
  signIn(redirectUri: string): Promise<AuthResult>;

  // Token management
  /**
   * Verify a token
   * @param token - The token to verify
   * @returns The token payload
   */
  verifyToken(token: string): Promise<TokenPayload | null>;

  /**
   * Refresh a token
   * @param refreshToken - The refresh token to use for the refresh
   * @returns The authentication result
   */
  refreshToken(refreshToken: string): Promise<AuthResult>;

  /**
   * Revoke a token
   * @param token - The token to revoke
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Initialize the IDP
   * @param app - The express app
   */
  initialize(app: Express): Promise<void>;

  /**
   * Shutdown the IDP, close all connections and release resources
   */
  shutdown(): Promise<void>;

  // User management
  /**
   * Get the user info
   * @param token - The token to use for the user info
   * @returns The user info
   */
  getUserInfo(token: string): Promise<User>;

  /**
   * Get the project info
   * @param token - The token to use for the project info
   * @returns The project info
   */
  getProjectInfo(token: string): Promise<Project>;

  /**
   * Get the user projects
   * @param token - The token to use for the user projects
   * @returns The user projects
   */
  getUserProjects(token: string): Promise<Project[]>;
}

/**
 * Commands for adding a user to the IDP
 */
export interface IdpProviderAddUserCommand {
  addUser(username: string, password?: string): Promise<AddUserCommandResponse>;
}

/**
 * Commands for listing users from the IDP
 */
export interface IdpProviderListUsersCommand {
  listUsers(): Promise<User[]>;
}

/**
 * Commands for removing a user from the IDP
 */
export interface IdpProviderRemoveUserCommand {
  removeUser(userId: string): Promise<void>;
}

/**
 * Authentication result from IDP callback
 */
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  payload?: TokenPayload;
}
