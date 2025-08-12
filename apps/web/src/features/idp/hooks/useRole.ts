import { useMemo } from 'react';
import { useUser } from './useAuthState';
import { hasRole, hasAnyRole, hasAllRoles } from '../services';
import type { Role } from '../types';

/**
 * Hook to check user roles
 */
export function useRole() {
  const user = useUser();

  const roleChecks = useMemo(
    () => ({
      /**
       * Check if user has specific role
       */
      hasRole: (role: Role) => hasRole(user, role),

      /**
       * Check if user has any of the specified roles
       */
      hasAnyRole: (roles: Role[]) => hasAnyRole(user, roles),

      /**
       * Check if user has all specified roles
       */
      hasAllRoles: (roles: Role[]) => hasAllRoles(user, roles),

      /**
       * Check if user is admin
       */
      isAdmin: hasRole(user, 'admin'),

      /**
       * Check if user is editor or higher
       */
      canEdit: hasAnyRole(user, ['admin', 'editor']),

      /**
       * Check if user has at least viewer access
       */
      canView: hasAnyRole(user, ['admin', 'editor', 'viewer']),

      /**
       * Get all user roles
       */
      roles: user?.roles ?? [],

      /**
       * Get user's highest role (admin > editor > viewer)
       */
      highestRole: (() => {
        if (hasRole(user, 'admin')) return 'admin';
        if (hasRole(user, 'editor')) return 'editor';
        if (hasRole(user, 'viewer')) return 'viewer';
        return null;
      })(),
    }),
    [user]
  );

  return roleChecks;
}

/**
 * Hook to check if user has specific role
 */
export function useHasRole(role: Role): boolean {
  const user = useUser();
  return hasRole(user, role);
}

/**
 * Hook to check if user has any of the specified roles
 */
export function useHasAnyRole(roles: Role[]): boolean {
  const user = useUser();
  return hasAnyRole(user, roles);
}

/**
 * Hook to check if user has all specified roles
 */
export function useHasAllRoles(roles: Role[]): boolean {
  const user = useUser();
  return hasAllRoles(user, roles);
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin(): boolean {
  return useHasRole('admin');
}

/**
 * Hook to check if user can edit (admin or editor)
 */
export function useCanEdit(): boolean {
  return useHasAnyRole(['admin', 'editor']);
}

/**
 * Hook to check if user can view (any role)
 */
export function useCanView(): boolean {
  return useHasAnyRole(['admin', 'editor', 'viewer']);
}
