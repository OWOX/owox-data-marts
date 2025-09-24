import { randomUUID } from 'crypto';
import { ILogger, LoggerFactory } from '@owox/internal-helpers';
import type {
  AdminUserDetailsView,
  AdminUserView,
  Role,
  DatabaseOperationResult,
  DatabaseUser,
} from '../types/index.js';
import type { DatabaseStore } from './DatabaseStore.js';

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
  private readonly logger: ILogger;

  constructor(private readonly dbPath: string) {
    this.logger = LoggerFactory.createNamedLogger('BetterAuthSqliteDatabaseStore');
  }

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
      this.logger.error({ error }, 'Failed to close SQLite database');
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
      try {
        this.getDb().prepare('DELETE FROM member WHERE userId = ?').run(userId);
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

  async defaultOrganizationExists(slug: string): Promise<boolean> {
    await this.connect();
    const stmt = this.getDb().prepare('SELECT id FROM organization WHERE slug = ? LIMIT 1');
    const row = stmt.get(slug) as { id: string } | undefined;
    return !!row;
  }

  async createDefaultOrganizationForUser(
    org: { id: string; name: string; slug: string },
    userId: string,
    role: Role
  ): Promise<void> {
    await this.connect();
    const now = new Date().toISOString();
    try {
      this.getDb()
        .prepare(
          'INSERT INTO organization (id, name, slug, metadata, createdAt) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          org.id,
          org.name,
          org.slug,
          JSON.stringify({ isDefault: true, createdBy: userId }),
          now
        );

      this.getDb()
        .prepare(
          'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)'
        )
        .run(this.generateId(), org.id, userId, role, now);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('UNIQUE constraint failed') || msg.includes('already exists')) {
        await this.addUserToOrganization(org.id, userId, role);
        return;
      }
      throw err;
    }
  }

  async addUserToOrganization(orgId: string, userId: string, role: Role): Promise<void> {
    await this.connect();
    const existing = this.getDb()
      .prepare('SELECT role FROM member WHERE userId = ? AND organizationId = ?')
      .get(userId, orgId) as { role: string } | undefined;

    if (existing) {
      this.getDb()
        .prepare('UPDATE member SET role = ? WHERE userId = ? AND organizationId = ?')
        .run(role, userId, orgId);
    } else {
      const now = new Date().toISOString();
      this.getDb()
        .prepare(
          'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)'
        )
        .run(this.generateId(), orgId, userId, role, now);
    }
  }

  async getUserRole(orgId: string, userId: string): Promise<string | null> {
    await this.connect();
    const row = this.getDb()
      .prepare('SELECT role FROM member WHERE userId = ? AND organizationId = ?')
      .get(userId, orgId) as { role: string } | undefined;
    return row?.role ?? null;
  }

  async getUsersForAdmin(): Promise<AdminUserView[]> {
    await this.connect();
    const stmt = this.getDb().prepare(
      `SELECT 
        u.id, u.email, u.name, u.createdAt, u.updatedAt,
        COALESCE(m.role, 'viewer') as role
       FROM user u
       LEFT JOIN member m ON u.id = m.userId
       ORDER BY u.createdAt DESC`
    );
    return stmt.all() as AdminUserView[];
  }

  async getUserDetails(userId: string): Promise<AdminUserDetailsView | null> {
    await this.connect();
    const stmt = this.getDb().prepare(
      `SELECT 
        u.id, u.email, u.name, u.createdAt, u.updatedAt,
        COALESCE(m.role, 'viewer') as role,
        m.organizationId
       FROM user u
       LEFT JOIN member m ON u.id = m.userId
       WHERE u.id = ?`
    );
    const row = stmt.get(userId) as AdminUserDetailsView | undefined;
    return row ?? null;
  }
}
