import { createBetterAuthConfig } from '../auth/auth-config.js';
import { getMigrations } from 'better-auth/db';
import { DatabaseUser, DatabaseOperationResult } from '../types/database-models.js';

export class DatabaseService {
  constructor(private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>) {}

  async runMigrations(): Promise<void> {
    try {
      const { runMigrations, compileMigrations } = await getMigrations(this.auth.options);

      await runMigrations();
      await compileMigrations();
    } catch (error) {
      console.error('Database migration failed:', error);
      throw new Error(
        `Database migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getUsersDirectly(): Promise<DatabaseUser[]> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations');
        throw new Error('Database adapter does not support direct operations');
      }

      const stmt = db.prepare(
        'SELECT id, email, name, createdAt FROM user ORDER BY createdAt DESC'
      );
      const users = stmt.all() as DatabaseUser[];

      return users;
    } catch (error) {
      console.error('Error getting users directly from database:', error);
      throw new Error(
        `Failed to get users from database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getUserByIdDirectly(userId: string): Promise<DatabaseUser | null> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations');
        throw new Error('Database adapter does not support direct operations');
      }

      const stmt = db.prepare('SELECT id, email, name, createdAt FROM user WHERE id = ?');
      const user = stmt.get(userId) as DatabaseUser | undefined;

      return user || null;
    } catch (error) {
      console.error('Error getting user by ID from database:', error);
      throw new Error(
        `Failed to get user from database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async removeUserDirectly(userId: string): Promise<DatabaseOperationResult> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations');
        throw new Error('Database adapter does not support direct operations');
      }

      // Clean up user's sessions
      try {
        const deleteSessionsStmt = db.prepare('DELETE FROM session WHERE userId = ?');
        deleteSessionsStmt.run(userId);
      } catch {
        // Session cleanup may not be needed
      }

      // Clean up user's accounts
      try {
        const deleteAccountsStmt = db.prepare('DELETE FROM account WHERE userId = ?');
        deleteAccountsStmt.run(userId);
      } catch {
        // Account cleanup may not be needed
      }

      // Clean up organization memberships
      try {
        const deleteMembershipsStmt = db.prepare('DELETE FROM member WHERE userId = ?');
        deleteMembershipsStmt.run(userId);
      } catch {
        // Organization membership cleanup may not be needed
      }

      // Finally, remove the user
      const deleteUserStmt = db.prepare('DELETE FROM user WHERE id = ?');
      const result = deleteUserStmt.run(userId) as DatabaseOperationResult;

      if (result.changes === 0) {
        console.error(`User ${userId} not found in database`);
        throw new Error(`User ${userId} not found`);
      }

      return result;
    } catch (error) {
      console.error(`Failed to delete user ${userId} from database:`, error);
      throw new Error(
        `Failed to delete user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getUserCount(): Promise<number> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations');
        throw new Error('Database adapter does not support direct operations');
      }

      const stmt = db.prepare('SELECT COUNT(*) as count FROM user');
      const result = stmt.get() as { count: number };

      return result.count;
    } catch (error) {
      console.error('Error getting user count from database:', error);
      throw new Error(
        `Failed to get user count: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async cleanupExpiredSessions(): Promise<DatabaseOperationResult> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations');
        throw new Error('Database adapter does not support direct operations');
      }

      const stmt = db.prepare('DELETE FROM session WHERE expiresAt < datetime("now")');
      const result = stmt.run() as DatabaseOperationResult;

      return result;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      throw new Error(
        `Failed to cleanup expired sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async isDatabaseHealthy(): Promise<boolean> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        return false;
      }

      // Simple health check - try to query the user table
      const stmt = db.prepare('SELECT 1 FROM user LIMIT 1');
      stmt.get();

      return true;
    } catch {
      return false;
    }
  }
}
