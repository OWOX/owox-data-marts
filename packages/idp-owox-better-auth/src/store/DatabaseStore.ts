import { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import { StoreResult } from './StoreResult.js';

/**
 * Contract for database operations used by Better Auth and PKCE storage.
 */
export interface DatabaseStore {
  // Init/maintenance
  initialize(): Promise<void>;
  // Generic health/maintenance
  isHealthy(): Promise<boolean>;
  cleanupExpiredSessions(): Promise<DatabaseOperationResult>;
  shutdown(): Promise<void>;

  // Expose underlying DB adapter (pool/connection)
  getAdapter(): Promise<unknown>;

  // Users
  getUserById(userId: string): Promise<DatabaseUser | null>;
  getUserByEmail(email: string): Promise<DatabaseUser | null>;
  getAccountByUserId(userId: string): Promise<DatabaseAccount | null>;

  // PKCE
  saveAuthState(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void>;
  getAuthState(state: string): Promise<StoreResult>;
  deleteAuthState(state: string): Promise<void>;
  purgeExpiredAuthStates(): Promise<number>;
}
