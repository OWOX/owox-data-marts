import { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import type { ProjectMember } from '@owox/idp-protocol';
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

  // Project Members Storage
  /**
   * Save project members to persistent storage.
   * Uses UPSERT logic: updates existing members, adds new ones.
   * Members not present in the update remain in storage with their current status.
   */
  saveProjectMembers(
    projectId: string,
    members: ProjectMember[],
    ttlSeconds: number
  ): Promise<void>;

  /**
   * Get all project members for a specific project.
   * Returns all members including those marked as outbound.
   */
  getProjectMembers(projectId: string): Promise<ProjectMember[] | null>;

  /**
   * Get project sync info (expires_at and updated_at) from the project table.
   * Used to determine if project members data needs to be refreshed.
   */
  getProjectSyncInfo(
    projectId: string
  ): Promise<{ expiresAt: Date | null; updatedAt: Date | null } | null>;
}
