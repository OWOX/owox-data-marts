import { AuthTokens, KeyPair, Project, TokenPayload, User } from './types.js';

export interface IIdpProvider {
  // Authentication
  signIn(credentials: SignInCredentials): Promise<AuthResult>;
  signOut(userId: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<AuthTokens>;

  // Magic Link flow
  createMagicLink(email: string, projectId: string): Promise<MagicLink>;
  verifyMagicLink(token: string): Promise<AuthResult>;

  // User management
  createUser(data: CreateUserDto): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, data: UpdateUserDto): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Token management
  verifyAccessToken(token: string): Promise<TokenPayload>;
  revokeTokens(userId: string): Promise<void>;

  // Project management
  createProject(data: CreateProjectDto): Promise<Project>;
  getProject(id: string): Promise<Project | null>;

  // Key management
  rotateKeys(): Promise<KeyPair>;
  getPublicKey(kid?: string): Promise<string>;
}

export interface ITokenService {
  generateTokens(user: User, projectId: string): Promise<AuthTokens>;
  verifyToken(token: string): Promise<TokenPayload>;
  decodeToken(token: string): TokenPayload | null;
  refreshTokens(refreshToken: string): Promise<AuthTokens>;
}

export interface IKeyService {
  generateKeyPair(): Promise<KeyPair>;
  signToken(payload: any): Promise<string>;
  verifyToken(token: string): Promise<any>;
  getActiveKeyPair(): Promise<KeyPair>;
  rotateKeys(): Promise<KeyPair>;
}

// DTOs
export interface SignInCredentials {
  email?: string;
  password?: string;
  provider?: 'google' | 'microsoft';
  providerToken?: string;
}

export interface CreateUserDto {
  email: string;
  password?: string;
  name?: string;
  emailVerified?: boolean;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  emailVerified?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateProjectDto {
  name: string;
  metadata?: Record<string, any>;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
  isNewUser?: boolean;
}

export interface MagicLink {
  url: string;
  token: string;
  expiresAt: Date;
}

// Errors
export class IdpError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'IdpError';
  }
}

export class AuthenticationError extends IdpError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends IdpError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class TokenExpiredError extends IdpError {
  constructor(message: string = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

export class InvalidTokenError extends IdpError {
  constructor(message: string = 'Invalid token') {
    super(message, 'INVALID_TOKEN', 401);
  }
}

export interface TokenConfig {
  issuer: string;
  audience: string;
  accessTokenTTL: number; // in seconds
  refreshTokenTTL: number; // in seconds
}

export interface IKeyStorage {
  saveKeyPair(keyPair: KeyPair): Promise<void>;
  getKeyPair(kid: string): Promise<KeyPair | null>;
  getActiveKeyPair(): Promise<KeyPair | null>;
  setActiveKeyPair(kid: string): Promise<void>;
}
