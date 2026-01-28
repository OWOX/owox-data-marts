import { randomUUID } from 'crypto';
import type { DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import type { DatabaseStore } from './DatabaseStore.js';
import { logger } from '../logger.js';

type SqliteRunResult = { changes?: number };
type SqliteStmt = {
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown[];
  run: (...args: unknown[]) => SqliteRunResult;
};
type SqliteDb = {
  prepare: (sql: string) => SqliteStmt;
  pragma?: (p: string) => void;
  close?: () => void;
};

export class SqliteDatabaseStore implements DatabaseStore {
  private db?: SqliteDb;

  constructor(private readonly dbPath: string) {}

  async connect(): Promise<void> {
    if (this.db) return;
    const { default: DatabaseCtor } = await import('better-sqlite3');
    this.db = new (DatabaseCtor as unknown as new (filename: string, opts?: unknown) => SqliteDb)(
      this.dbPath,
      { fileMustExist: false }
    );
    // Ensure sane defaults
    try {
      this.db.pragma?.('journal_mode = WAL');
    } catch {
      // noop
    }
  }

  private getDb(): SqliteDb {
    if (!this.db) throw new Error('SqliteDatabaseStore is not connected');
    return this.db;
  }

  private generateId(): string {
    return randomUUID();
  }

  async shutdown(): Promise<void> {
    try {
      (this.db as { close?: () => void } | undefined)?.close?.();
    } catch (error) {
      logger.error('Failed to close SQLite database', {}, error as Error);
    } finally {
      this.db = undefined;
    }
  }

  async getAdapter(): Promise<unknown> {
    await this.connect();
    return this.getDb();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.connect();
      this.getDb().prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async cleanupExpiredSessions(): Promise<DatabaseOperationResult> {
    await this.connect();
    const stmt = this.getDb().prepare('DELETE FROM session WHERE expiresAt < datetime("now")');
    const result = stmt.run();
    return { changes: Number(result.changes ?? 0) };
  }

  async getUserCount(): Promise<number> {
    await this.connect();
    const row = this.getDb().prepare('SELECT COUNT(*) as count FROM user').get() as {
      count: number;
    };
    return row?.count ?? 0;
  }

  async getUsers(): Promise<DatabaseUser[]> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, email, name, createdAt FROM user ORDER BY createdAt DESC'
    );
    return stmt.all() as DatabaseUser[];
  }

  async getUserById(userId: string): Promise<DatabaseUser | null> {
    await this.connect();
    const stmt = this.getDb().prepare('SELECT id, email, name, createdAt FROM user WHERE id = ?');
    const row = stmt.get(userId) as DatabaseUser | undefined;
    return row ?? null;
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, email, name, createdAt FROM user WHERE email = ?'
    );
    const row = stmt.get(email) as DatabaseUser | undefined;
    return row ?? null;
  }

  async userHasPassword(userId: string): Promise<boolean> {
    await this.connect();
    try {
      const stmt = this.getDb().prepare(
        "SELECT password FROM account WHERE userId = ? AND providerId = 'credential'"
      );
      const row = stmt.get(userId) as { password?: string } | undefined;
      logger.debug('Checking user password', { userId, hasPassword: !!row?.password });
      return !!(row?.password && row.password.length > 0);
    } catch (e) {
      logger.error('Error checking user password', { userId }, e as Error);
      return false;
    }
  }

  async clearUserPassword(userId: string): Promise<void> {
    await this.connect();
    try {
      this.getDb()
        .prepare("DELETE FROM account WHERE userId = ? AND providerId = 'credential'")
        .run(userId);
    } catch {
      // Non-fatal: account might not exist
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.connect();
    try {
      this.getDb().prepare('DELETE FROM session WHERE userId = ?').run(userId);
    } catch {
      // Non-fatal: sessions might not exist
    }
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    await this.connect();
    const stmt = this.getDb().prepare('UPDATE user SET name = ? WHERE id = ?');
    const res = stmt.run(name, userId);
    if (!res.changes) throw new Error(`User ${userId} not found or not updated`);
  }

  async deleteUserCascade(userId: string): Promise<DatabaseOperationResult> {
    await this.connect();
    try {
      try {
        this.getDb().prepare('DELETE FROM session WHERE userId = ?').run(userId);
      } catch {
        // Non-fatal cleanup: table may not exist yet or may contain no rows for this user
      }
      try {
        this.getDb().prepare('DELETE FROM account WHERE userId = ?').run(userId);
      } catch {
        // Non-fatal cleanup: table may not exist yet or may contain no rows for this user
      }
      const res = this.getDb().prepare('DELETE FROM user WHERE id = ?').run(userId);
      if (!res.changes) throw new Error(`User ${userId} not found`);
      return { changes: Number(res.changes ?? 0) };
    } catch (e) {
      throw new Error(
        `Failed to delete user ${userId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}
