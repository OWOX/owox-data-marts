import { Role } from '@owox/idp-protocol';

/**
 * Authorization context
 */
export interface AuthorizationContext {
  projectId: string;
  userId: string;
  fullName?: string;
  email?: string;
  roles?: Role[];
}

export type AuthMethod = 'parse' | 'introspect';
