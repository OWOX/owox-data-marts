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
  projectTitle?: string;
  authFlow?: string;
  apiKeyId?: string;
  /**
   * True when the session is in view-only mode.
   * Used by web/analytics and other clients that need session restrictions.
   */
  viewOnly?: boolean;
}
