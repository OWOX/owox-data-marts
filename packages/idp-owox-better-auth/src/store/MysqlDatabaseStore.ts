import { Logger, LoggerFactory } from '@owox/internal-helpers';
import { randomUUID } from 'crypto';
import type { DatabaseOperationResult, DatabaseUser } from '../types/index.js';
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
  private readonly logger: Logger;

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
      this.logger.error('Failed to initialize MySQL pool', { error });
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

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, email, name, createdAt FROM user WHERE email = ? LIMIT 1',
      [email]
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

  async userHasPassword(userId: string): Promise<boolean> {
    const pool = await this.getPool();
    try {
      const [rows] = (await pool.execute(
        "SELECT password FROM account WHERE userId = ? AND providerId = 'credential' LIMIT 1",
        [userId]
      )) as [Array<Record<string, unknown>>, unknown];
      const r = (rows as Array<Record<string, unknown>>)[0];
      return !!(r?.password && String(r.password).length > 0);
    } catch {
      return false;
    }
  }

  async clearUserPassword(userId: string): Promise<void> {
    const pool = await this.getPool();
    try {
      await pool.execute("DELETE FROM account WHERE userId = ? AND providerId = 'credential'", [
        userId,
      ]);
    } catch {
      // Non-fatal: account might not exist
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const pool = await this.getPool();
    try {
      await pool.execute('DELETE FROM session WHERE userId = ?', [userId]);
    } catch {
      // Non-fatal: sessions might not exist
    }
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

  async shutdown(): Promise<void> {
    if (this.pool && typeof this.pool.end === 'function') {
      try {
        await this.pool.end();
      } catch (error) {
        this.logger.error('Failed to close MySQL pool', { error });
      } finally {
        this.pool = undefined;
      }
    }
  }

  async getAdapter(): Promise<unknown> {
    return await this.getPool();
  }
}
