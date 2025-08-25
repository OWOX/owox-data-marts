import { Payload } from '@owox/idp-protocol';

/**
 * Extended user payload with additional metadata
 */
export interface ExtendedUserPayload extends Payload {
  organizationId?: string;
  isDefault?: boolean;
  createdAt?: string;
}

/**
 * User creation request
 */
export interface CreateUserRequest {
  email: string;
  password?: string;
  name?: string;
  organizationId?: string;
}

/**
 * User list query options
 */
export interface UserListOptions {
  organizationId?: string;
  limit?: number;
  offset?: number;
}

/**
 * User management operation result
 */
export interface UserOperationResult {
  success: boolean;
  user?: ExtendedUserPayload;
  error?: string;
}
