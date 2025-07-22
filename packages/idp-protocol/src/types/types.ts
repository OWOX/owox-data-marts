export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface TokenPayload {
  sub: string; // user id
  email: string;
  roles: string[];
  permissions?: string[];
  projectId: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface MagicLinkPayload {
  email: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  kid: string; // Key ID
  algorithm: 'RS256' | 'ES256';
  createdAt: Date;
}
