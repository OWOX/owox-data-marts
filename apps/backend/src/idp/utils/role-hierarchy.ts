import { Role } from '@owox/idp-protocol';

/**
 * Which project roles satisfy a required role.
 *
 * It lives here rather than on IdpGuard so a caller does not have to import the guard
 * (and, through it, the IDP services) to ask a pure question about roles.
 */
export const ROLE_HIERARCHY: Record<Role, readonly Role[]> = {
  viewer: ['viewer', 'editor', 'admin'],
  editor: ['editor', 'admin'],
  admin: ['admin'],
};

/** True when any of `roles` meets `requiredRole`; an unrecognised role satisfies nothing. */
export function satisfiesRole(roles: readonly string[], requiredRole: Role): boolean {
  const acceptableRoles: readonly string[] = ROLE_HIERARCHY[requiredRole];
  return roles.some(role => acceptableRoles.includes(role));
}
