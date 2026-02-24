/**
 * Database user model
 */
export interface DatabaseUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  image?: string | null;
  lastLoginMethod?: string;
  firstLoginMethod?: string;
  biUserId?: string;
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
 * Database operation result
 */
export interface DatabaseOperationResult {
  changes: number;
  lastInsertRowid?: number;
}
