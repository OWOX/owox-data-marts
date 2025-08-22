/**
 * Database user model
 */
export interface DatabaseUser {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
}

/**
 * Database session model
 */
export interface DatabaseSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt?: string;
}

/**
 * Database account model
 */
export interface DatabaseAccount {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  createdAt?: string;
}

/**
 * Database organization member model
 */
export interface DatabaseMember {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt?: string;
  user?: DatabaseUser;
}

/**
 * Organization list members response
 */
export interface OrganizationMembersResponse {
  members: DatabaseMember[];
}

/**
 * Database operation result
 */
export interface DatabaseOperationResult {
  changes: number;
  lastInsertRowid?: number;
}
