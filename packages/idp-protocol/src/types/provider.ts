import { User, Project, TokenPayload, Session } from './models.js';
import {
  SignInCredentials,
  CreateUserDto,
  UpdateUserDto,
  CreateProjectDto,
  AuthResult,
  MagicLink,
} from './dto.js';
import { Request } from 'express';

export interface IIdpError {
  code: string;
  message: string;
  details?: any;
}

export interface IIdpRoute {
  path: string;
}

export interface IIdpRouter {
  getSignIn(): IIdpRoute;
  getSignOut(): IIdpRoute;
  getMagicLinkVerification(): IIdpRoute;
  getHealthCheck(): IIdpRoute;
}

export interface IIdpManagement {
  // User management
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(data: CreateUserDto): Promise<User>;
  updateUser(id: string, data: UpdateUserDto): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Project management
  createProject(data: CreateProjectDto): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
}

export interface IIdpTokenManagement {
  // Token introspection - parse IDP-specific token to protocol DTO
  introspect(token: string): Promise<TokenPayload>;
  refresh(refreshToken: string): Promise<AuthResult>;
  revoke(userId: string): Promise<void>;
  revoke(token: string): Promise<void>; // revoke specific token
}

export interface IIdpMagicLinkManagement {
  create(email: string, projectId: string): Promise<MagicLink>;
  verify(token: string): Promise<AuthResult>;
}

/**
 * Main IDP Provider interface - contract for all IDP implementations
 */
export interface IIdpProvider {
  // Initialize the IDP provider, like database connection, migrations, etc.
  initialize(): Promise<void>;

  // Verification ????
  verifyRequest(req: Request): void;

  // Authentication - returns IDP-specific tokens
  signIn(credentials: SignInCredentials): AuthResult;
  signOut(userId: string): void;

  // Magic Link flow
  getMagicLinkManagement(): IIdpMagicLinkManagement;

  // Router
  getRouter(): IIdpRouter;

  // Management
  getManagement(): IIdpManagement;

  // Token management
  getTokenManagement(): IIdpTokenManagement;

  // Lifecycle methods
  shutdown(): void; // cleanup resources close connections, etc.
  healthCheck(): boolean; // check if the IDP is healthy
}
