import { randomUUID } from 'crypto';
import { ILogger, LoggerFactory } from '@owox/internal-helpers';
import type {
  DatabaseOperationResult,
  DatabaseUser,
  AdminUserDetailsView,
  AdminUserView,
  Role,
} from '../types/index.js';
import type { DatabaseStore } from './DatabaseStore.js';

type MysqlExecResult = { affectedRows?: number };
type MysqlPool = {
  query: (sql: string, params?: unknown[]) => Promise<[Array<Record<string, unknown>>, unknown]>;
  execute: (
    sql: string,
    params?: unknown[]
  ) => Promise<[Array<Record<string, unknown>> | MysqlExecResult, unknown]>;
  end?: () => Promise<void>;
};

export interface MysqlConnectionConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number;
  ssl?: unknown;
}

export class MysqlDatabaseStore implements DatabaseStore {
  private pool?: MysqlPool;
  private readonly logger: ILogger;

  constructor(private readonly config: MysqlConnectionConfig) {
    this.logger = LoggerFactory.createNamedLogger('BetterAuthMysqlDatabaseStore');
  }

  private async getPool(): Promise<MysqlPool> {
    if (this.pool) return this.pool;

    try {
      const mysql = await import('mysql2/promise');

      this.pool = (
        mysql as { default: { createPool: (config: unknown) => unknown } }
      ).default.createPool({
        host: this.config.host,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        port: this.config.port || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: this.config.ssl,
      }) as MysqlPool;
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize MySQL pool');
      throw new Error('mysql2 is required for MySQL support. Install it with: npm install mysql2');
    }

    return this.pool;
  }

  private toIso(val: unknown): string | null {
    if (val == null) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  }

  private generateId(): string {
    return randomUUID();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const pool = await this.getPool();
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async cleanupExpiredSessions(): Promise<DatabaseOperationResult> {
    const pool = await this.getPool();
    const [result] = (await pool.execute('DELETE FROM session WHERE expiresAt < NOW()')) as [
      MysqlExecResult,
      unknown,
    ];
    return { changes: Number((result as MysqlExecResult)?.affectedRows ?? 0) };
  }

  async getUserCount(): Promise<number> {
    const pool = await this.getPool();
    const [rows] = (await pool.query('SELECT COUNT(*) as count FROM user')) as [
      Array<Record<string, unknown>>,
      unknown,
    ];
    const row = rows[0] as Record<string, unknown> & { count?: number };
    return row?.count ?? 0;
  }

  async getUsers(): Promise<DatabaseUser[]> {
    const pool = await this.getPool();
    const [rows] = (await pool.query(
      'SELECT id, email, name, createdAt FROM user ORDER BY createdAt DESC'
    )) as [Array<Record<string, unknown>>, unknown];
    return (rows as Array<Record<string, unknown>>).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      email: String(r.email),
      name: r.name != null ? String(r.name) : undefined,
      createdAt: this.toIso(r.createdAt) ?? undefined,
    }));
  }

  async getUserById(userId: string): Promise<DatabaseUser | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, email, name, createdAt FROM user WHERE id = ? LIMIT 1',
      [userId]
    )) as [Array<Record<string, unknown>>, unknown];
    const r = (rows as Array<Record<string, unknown>>)[0];
    if (!r) return null;
    return {
      id: String(r.id),
      email: String(r.email),
      name: r.name != null ? String(r.name) : undefined,
      createdAt: this.toIso(r.createdAt) ?? undefined,
    };
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    const pool = await this.getPool();
    const [res] = (await pool.execute('UPDATE user SET name = ? WHERE id = ?', [name, userId])) as [
      MysqlExecResult,
      unknown,
    ];
    if (!(res as MysqlExecResult)?.affectedRows)
      throw new Error(`User ${userId} not found or not updated`);
  }

  async deleteUserCascade(userId: string): Promise<DatabaseOperationResult> {
    const pool = await this.getPool();
    try {
      try {
        await pool.execute('DELETE FROM session WHERE userId = ?', [userId]);
      } catch {
        // Non-fatal cleanup: table may not exist yet or may contain no rows for this user
      }
      try {
        await pool.execute('DELETE FROM account WHERE userId = ?', [userId]);
      } catch {
        // Non-fatal cleanup: table may not exist yet or may contain no rows for this user
      }
      try {
        await pool.execute('DELETE FROM member WHERE userId = ?', [userId]);
      } catch {
        // Non-fatal cleanup: table may not exist yet or may contain no rows for this user
      }
      const [res] = (await pool.execute('DELETE FROM user WHERE id = ?', [userId])) as [
        MysqlExecResult,
        unknown,
      ];
      if (!(res as MysqlExecResult)?.affectedRows) throw new Error(`User ${userId} not found`);
      return { changes: Number((res as MysqlExecResult).affectedRows ?? 0) };
    } catch (e) {
      throw new Error(
        `Failed to delete user ${userId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async defaultOrganizationExists(slug: string): Promise<boolean> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute('SELECT id FROM organization WHERE slug = ? LIMIT 1', [
      slug,
    ])) as [Array<Record<string, unknown>>, unknown];
    return (rows as Array<Record<string, unknown>>).length > 0;
  }

  async createDefaultOrganizationForUser(
    org: { id: string; name: string; slug: string },
    userId: string,
    role: Role
  ): Promise<void> {
    const pool = await this.getPool();
    const now = new Date();
    try {
      await pool.execute(
        'INSERT INTO organization (id, name, slug, metadata, createdAt) VALUES (?, ?, ?, ?, ?)',
        [org.id, org.name, org.slug, JSON.stringify({ isDefault: true, createdBy: userId }), now]
      );
      await pool.execute(
        'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
        [this.generateId(), org.id, userId, role, now]
      );
    } catch (err) {
      const msg = String(err).toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) {
        await this.addUserToOrganization(org.id, userId, role);
        return;
      }
      throw err;
    }
  }

  async addUserToOrganization(orgId: string, userId: string, role: Role): Promise<void> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT role FROM member WHERE userId = ? AND organizationId = ?',
      [userId, orgId]
    )) as [Array<Record<string, unknown>>, unknown];
    if ((rows as Array<Record<string, unknown>>).length > 0) {
      await pool.execute('UPDATE member SET role = ? WHERE userId = ? AND organizationId = ?', [
        role,
        userId,
        orgId,
      ]);
    } else {
      const now = new Date();
      await pool.execute(
        'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
        [this.generateId(), orgId, userId, role, now]
      );
    }
  }

  async getUserRole(orgId: string, userId: string): Promise<string | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT role FROM member WHERE userId = ? AND organizationId = ? LIMIT 1',
      [userId, orgId]
    )) as [Array<Record<string, unknown>>, unknown];
    const list = rows as Array<Record<string, unknown>>;
    if (list.length === 0) return null;
    const first = list[0] as Record<string, unknown>;
    return String(first.role);
  }

  async getUsersForAdmin(): Promise<AdminUserView[]> {
    const pool = await this.getPool();
    const [rows] = (await pool.query(
      `SELECT 
        u.id, u.email, u.name, u.createdAt, u.updatedAt,
        COALESCE(m.role, 'viewer') as role
       FROM user u
       LEFT JOIN member m ON u.id = m.userId
       ORDER BY u.createdAt DESC`
    )) as [Array<Record<string, unknown>>, unknown];
    return (rows as Array<Record<string, unknown>>).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      email: String(r.email),
      name: r.name != null ? String(r.name) : null,
      role: String(r.role),
      createdAt: this.toIso(r.createdAt) ?? '',
      updatedAt: this.toIso(r.updatedAt),
    }));
  }

  async getUserDetails(userId: string): Promise<AdminUserDetailsView | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      `SELECT 
        u.id, u.email, u.name, u.createdAt, u.updatedAt,
        COALESCE(m.role, 'viewer') as role,
        m.organizationId
       FROM user u
       LEFT JOIN member m ON u.id = m.userId
       WHERE u.id = ?`,
      [userId]
    )) as [Array<Record<string, unknown>>, unknown];
    const r = (rows as Array<Record<string, unknown>>)[0];
    if (!r) return null;
    return {
      id: String(r.id),
      email: String(r.email),
      name: r.name != null ? String(r.name) : null,
      role: String(r.role),
      createdAt: this.toIso(r.createdAt) ?? '',
      updatedAt: this.toIso(r.updatedAt),
      organizationId: r.organizationId != null ? String(r.organizationId) : null,
    };
  }

  async shutdown(): Promise<void> {
    if (this.pool && typeof this.pool.end === 'function') {
      try {
        await this.pool.end();
      } catch (error) {
        this.logger.error({ error }, 'Failed to close MySQL pool');
      } finally {
        this.pool = undefined;
      }
    }
  }

  async getAdapter(): Promise<unknown> {
    return await this.getPool();
  }
}
