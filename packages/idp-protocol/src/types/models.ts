/**
 * User model
 */
export interface User {
  id: string;
  email: string;
  name?: string;
}

/**
 * Project model
 */
export interface Project {
  id: string;
  name: string;
}

/**
 * Standardized token payload that all IDP implementations must return when introspecting their native tokens
 */
export interface TokenPayload {
  sub: string; // user id
  email: string;
  name?: string;
  roles: string[];
  projectId: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Response for adding a user to the IDP
 */
export interface AddUserCommandResponse {
  username: string;
  magicLink?: string;
}
