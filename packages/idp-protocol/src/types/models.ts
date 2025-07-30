/**
 * Core domain models for the IDP protocol
 */

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
  metadata?: Record<string, any>;
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

/**
 * Standardized token payload that all IDP implementations must return
 * when introspecting their native tokens
 */
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

/**
 * Internal payload for magic link functionality
 */
export interface MagicLinkPayload {
  email: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
