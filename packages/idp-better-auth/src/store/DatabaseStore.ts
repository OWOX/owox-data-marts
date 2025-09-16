import type { AdminUserDetailsView, AdminUserView, Role } from '../types/index.js';
import { DatabaseOperationResult, DatabaseUser } from '../types/index.js';

export interface DatabaseStore {
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
  updateUserName(userId: string, name: string): Promise<void>;
  deleteUserCascade(userId: string): Promise<DatabaseOperationResult>;

  // Organization and roles
  defaultOrganizationExists(slug: string): Promise<boolean>;
  createDefaultOrganizationForUser(
    org: { id: string; name: string; slug: string },
    userId: string,
    role: Role
  ): Promise<void>;
  addUserToOrganization(orgId: string, userId: string, role: Role): Promise<void>;
  getUserRole(orgId: string, userId: string): Promise<string | null>;

  // Admin views
  getUsersForAdmin(): Promise<AdminUserView[]>;
  getUserDetails(userId: string): Promise<AdminUserDetailsView | null>;
}
