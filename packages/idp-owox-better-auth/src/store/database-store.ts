import { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import { StoreResult } from './store-result.js';

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
  /**
   * Returns all accounts linked to the user, ordered by update time desc if available.
   */
  getAccountsByUserId(userId: string): Promise<DatabaseAccount[]>;
  getAccountByUserIdAndProvider(
    userId: string,
    providerId: string
  ): Promise<DatabaseAccount | null>;
  updateUserLastLoginMethod(userId: string, loginMethod: string): Promise<void>;

  /**
   * Updates the user's first login method if not already set.
   * This should only be called once per user during initial authentication.
   */
  updateUserFirstLoginMethod(userId: string, loginMethod: string): Promise<void>;

  /**
   * Updates the user's BI user ID if not already set.
   * This should only be called once per user during initial authentication.
   */
  updateUserBiUserId(userId: string, biUserId: string): Promise<void>;

  /**
   * Returns active (non-expired) magic-link verification entry for the email, if any.
   */
  findActiveMagicLink(
    email: string
  ): Promise<{ id: string; createdAt?: Date | null; expiresAt?: Date | null } | null>;

  // PKCE
  saveAuthState(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void>;
  getAuthState(state: string): Promise<StoreResult>;
  deleteAuthState(state: string): Promise<void>;
  purgeExpiredAuthStates(): Promise<number>;
}
