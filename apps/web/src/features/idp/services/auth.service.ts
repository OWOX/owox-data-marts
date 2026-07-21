import type { CurrentUserResponse, Role, User } from '../types';

/**
 * Convert current user API response to user object
 */
export function currentUserResponseToUser(payload: CurrentUserResponse): User {
  return {
    id: payload.userId,
    email: payload.email,
    fullName: payload.fullName,
    roles: payload.roles,
    projectId: payload.projectId,
    projectTitle: payload.projectTitle,
    mcpServerUrl: payload.mcpServerUrl,
    avatar: payload.avatar,
    onboarding: payload.onboarding,
    // Only surface when true so normal sessions stay free of the flag.
    viewOnly: payload.viewOnly === true ? true : undefined,
  };
}

/**
 * Whether the current session is in view-only mode.
 * Prefer this helper over raw field checks so analytics/UI gates stay consistent.
 */
export function isViewOnlySession(user: User | null | undefined): boolean {
  return user?.viewOnly === true;
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
  currentUserResponseToUser,
  isViewOnlySession,
  hasRole,
  hasAnyRole,
  hasAllRoles,
};
