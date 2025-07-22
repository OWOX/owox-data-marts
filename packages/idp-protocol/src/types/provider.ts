import { User, Project, TokenPayload } from './models.js';
import {
  SignInCredentials,
  CreateUserDto,
  UpdateUserDto,
  CreateProjectDto,
  AuthResult,
  MagicLink,
} from './dto.js';

/**
 * Main IDP Provider interface - contract for all IDP implementations
 */
export interface IIdpProvider {
  // Authentication - returns IDP-specific tokens
  signIn(credentials: SignInCredentials): Promise<AuthResult>;
  signOut(userId: string): Promise<void>;

  // Magic Link flow
  createMagicLink(email: string, projectId: string): Promise<MagicLink>;
  verifyMagicLink(token: string): Promise<AuthResult>;

  // User management
  createUser(data: CreateUserDto): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, data: UpdateUserDto): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Token introspection - parse IDP-specific token to protocol DTO
  introspectToken(token: string): Promise<TokenPayload>;
  revokeTokens(userId: string): Promise<void>;

  // Project management
  createProject(data: CreateProjectDto): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
}
