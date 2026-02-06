import { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import { StoreResult } from './StoreResult.js';

export interface DatabaseStore {
  // Init/maintenance
  initialize(): Promise<void>;
  // Generic health/maintenance
  isHealthy(): Promise<boolean>;
  cleanupExpiredSessions(): Promise<DatabaseOperationResult>;
  getUserCount(): Promise<number>;
  shutdown(): Promise<void>;

  // Expose underlying DB adapter (pool/connection) for Better Auth
  getAdapter(): Promise<unknown>;

  // Users
  getUsers(): Promise<DatabaseUser[]>;
  getUserById(userId: string): Promise<DatabaseUser | null>;
  getUserByEmail(email: string): Promise<DatabaseUser | null>;
  getAccountByUserId(userId: string): Promise<DatabaseAccount | null>;
  updateUserName(userId: string, name: string): Promise<void>;
  deleteUserCascade(userId: string): Promise<DatabaseOperationResult>;
  userHasPassword(userId: string): Promise<boolean>;
  clearUserPassword(userId: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;

  // PKCE auth state
  saveAuthState(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void>;
  getAuthState(state: string): Promise<StoreResult>;
  deleteAuthState(state: string): Promise<void>;
  purgeExpiredAuthStates(): Promise<number>;
}
