import type { Request, Response, NextFunction } from 'express';
import type { User, Project, TokenPayload, IdpTokens } from '../types/index.js';

/**
 * Express request with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user?: User;
  tokenPayload?: TokenPayload;
}

/**
 * Authentication Page Handlers (GET - for user-facing pages)
 * These serve HTML pages for user interaction
 */
export type SignInPageRequest = Request;
export type SignOutPageRequest = Request;
export type SignUpPageRequest = Request;
export type MagicLinkPageRequest = Request;
export type MagicLinkVerifyPageRequest = Request;
export type GoogleCallbackPageRequest = Request;
export type MicrosoftCallbackPageRequest = Request;
export type VerifyEmailPageRequest = Request;
export type VerifyEmailResendPageRequest = Request;
export type PasswordResetPageRequest = Request;
export type PasswordResetVerifyPageRequest = Request;
export type PasswordChangePageRequest = Request;

/**
 * Authentication API Handlers (POST - for programmatic access)
 */
// Token refresh API
export interface RefreshTokenApiRequest extends Request {
  body: {
    refreshToken: string;
  };
}
export interface RefreshTokenApiResponse {
  success: boolean;
  data?: IdpTokens;
  error?: string;
}

// Token revoke API
export interface RevokeTokenApiRequest extends Request {
  body: {
    token: string;
  };
}
export interface RevokeTokenApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Token introspection API
export interface IntrospectTokenApiRequest extends Request {
  body: {
    token: string;
  };
}
export interface IntrospectTokenApiResponse {
  success: boolean;
  data?: TokenPayload;
  error?: string;
  active?: boolean;
}

/**
 * Management API Handlers
 */
// User management
export interface GetUsersRequest extends AuthenticatedRequest {
  query: {
    page?: string;
    limit?: string;
    search?: string;
    projectId?: string;
  };
}
export interface GetUsersResponse {
  success: boolean;
  data?: {
    users: User[];
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}

export interface CreateUserRequest extends AuthenticatedRequest {
  body: {
    email: string;
    name?: string;
    password?: string;
    projectId?: string;
    roles?: string[];
  };
}
export interface CreateUserResponse {
  success: boolean;
  data?: User;
  error?: string;
}

export interface GetUserRequest extends AuthenticatedRequest {
  params: {
    id: string;
  };
}
export interface GetUserResponse {
  success: boolean;
  data?: User;
  error?: string;
}

export interface UpdateUserRequest extends AuthenticatedRequest {
  params: {
    id: string;
  };
  body: {
    name?: string;
    email?: string;
    roles?: string[];
  };
}
export interface UpdateUserResponse {
  success: boolean;
  data?: User;
  error?: string;
}

export interface DeleteUserRequest extends AuthenticatedRequest {
  params: {
    id: string;
  };
}
export interface DeleteUserResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Project management
export interface GetProjectsRequest extends AuthenticatedRequest {
  query: {
    page?: string;
    limit?: string;
  };
}
export interface GetProjectsResponse {
  success: boolean;
  data?: {
    projects: Project[];
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}

export interface CreateProjectRequest extends AuthenticatedRequest {
  body: {
    name: string;
    description?: string;
  };
}
export interface CreateProjectResponse {
  success: boolean;
  data?: Project;
  error?: string;
}

// Health check
export type HealthCheckRequest = Request;
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version?: string;
  uptime?: number;
  dependencies?: {
    database: 'ok' | 'error';
    [key: string]: 'ok' | 'error';
  };
}

/**
 * Route handler type definitions
 */
export type AuthPageHandler<TReq extends Request = Request> = (
  req: TReq,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export type AuthApiHandler<TReq extends Request = Request, TRes = any> = (
  req: TReq,
  res: Response<TRes>,
  next: NextFunction
) => Promise<void> | void;

export type ApiHandler<TReq extends Request = Request, TRes = any> = (
  req: TReq,
  res: Response<TRes>,
  next: NextFunction
) => Promise<void> | void;
