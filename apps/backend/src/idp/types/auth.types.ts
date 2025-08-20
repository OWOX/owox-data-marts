import type { Role as RoleType } from '@owox/idp-protocol';

/**
 * Authorization context
 */
export interface AuthorizationContext {
  projectId: string;
  userId: string;
  fullName?: string;
  avatar?: string;
  email?: string;
  roles?: RoleType[];
}
