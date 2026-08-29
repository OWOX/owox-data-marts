import { Role } from '@owox/idp-protocol';

/**
 * Which project roles satisfy a required role.
 *
 * The one definition of the hierarchy, because it is enforced in two places that MUST
 * agree: `IdpGuard.checkRoleAuthorization` guards the REST controllers, while the MCP
 * facades check it by hand — the MCP surface is gated on OAuth SCOPES, not project
 * roles, so a viewer whose client holds `mcp:write` would otherwise reach mutations
 * that `@Auth(Role.editor())` refuses over REST. The two must refuse the same callers,
 * and while the rows were restated per call site a change to one silently opened the
 * other.
 *
 * It lives here rather than on IdpGuard so a caller does not have to import the guard
 * (and, through it, the IDP services) to ask a pure question about roles.
 */
export const ROLE_HIERARCHY: Record<Role, readonly Role[]> = {
  viewer: ['viewer', 'editor', 'admin'],
  editor: ['editor', 'admin'],
  admin: ['admin'],
};

/**
 * True when any of `roles` meets `requiredRole` under the hierarchy above.
 *
 * `roles` is `readonly string[]` rather than `Role[]` because the MCP session carries
 * whatever the token said; an unrecognised role simply satisfies nothing.
 */
export function satisfiesRole(roles: readonly string[], requiredRole: Role): boolean {
  const acceptableRoles: readonly string[] = ROLE_HIERARCHY[requiredRole];
  return roles.some(role => acceptableRoles.includes(role));
}
