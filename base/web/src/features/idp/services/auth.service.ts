import type { Role, TokenPayload, User } from '../types';

/**
 * Convert token payload to user object
 */
export function tokenPayloadToUser(payload: TokenPayload): User {
  return {
    id: payload.userId,
    email: payload.email,
    fullName: payload.fullName,
    roles: payload.roles,
    projectId: payload.projectId,
    projectTitle: payload.projectTitle,
    avatar: payload.avatar,
  };
}

/**
 * Check if user has specific role
 */
export function hasRole(user: User | null, role: Role): boolean {
  if (!user?.roles) {
    return false;
  }
  return user.roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(user: User | null, roles: Role[]): boolean {
  return roles.some(role => hasRole(user, role));
}

/**
 * Check if user has all specified roles
 */
export function hasAllRoles(user: User | null, roles: Role[]): boolean {
  return roles.every(role => hasRole(user, role));
}

export const AuthService = {
  tokenPayloadToUser,
  hasRole,
  hasAnyRole,
  hasAllRoles,
};
