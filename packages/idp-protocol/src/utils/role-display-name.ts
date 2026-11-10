import type { Role } from '../types/models.js';

/** Project roles as the product names them. */
export const ROLE_DISPLAY_NAMES: Readonly<Record<Role, string>> = {
  admin: 'Project Admin',
  editor: 'Data Owner',
  viewer: 'Business User',
};

/** True for a role code that has a product name. */
export function hasRoleDisplayName(role: string): role is Role {
  return Object.prototype.hasOwnProperty.call(ROLE_DISPLAY_NAMES, role);
}

/** The product name of a project role; any other value is returned as is. */
export function getRoleDisplayName(role: string): string {
  return hasRoleDisplayName(role) ? ROLE_DISPLAY_NAMES[role] : role;
}
