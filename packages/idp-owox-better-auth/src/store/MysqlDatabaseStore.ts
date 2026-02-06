import { Logger, LoggerFactory } from '@owox/internal-helpers';
import type { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import type { DatabaseStore } from './DatabaseStore.js';
import { StoreResult } from './StoreResult.js';

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
  private authTableReady = false;

  constructor(private readonly config: MysqlConnectionConfig) {
    this.assertConfig(config);
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

  private toIso(val: unknown): string | undefined {
    if (val == null) return undefined;
    if (val instanceof Date) return val.toISOString();
    try {
      const parsed = new Date(String(val));
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      // ignore parse errors
    }
    return String(val);
  }

  private mapUser(row: Record<string, unknown>): DatabaseUser {
    return {
      id: String(row.id),
      email: String(row.email),
      name: row.name != null ? String(row.name) : undefined,
      image: row.image != null ? String(row.image) : null,
      createdAt: this.toIso(row.createdAt),
    };
  }

  private mapAccount(row: Record<string, unknown>): DatabaseAccount {
    return {
      id: String(row.id),
      accountId: String(row.accountId),
      providerId: String(row.providerId),
      userId: String(row.userId),
      createdAt: this.toIso(row.createdAt),
    };
  }

  async initialize(): Promise<void> {
    const pool = await this.getPool();
    await this.ensureAuthStatesTable(pool);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const pool = await this.getPool();
      await pool.query('SELECT 1');
      await this.ensureAuthStatesTable(pool);
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
      'SELECT id, email, name, image, createdAt FROM user ORDER BY createdAt DESC'
    )) as [Array<Record<string, unknown>>, unknown];
    return (rows as Array<Record<string, unknown>>).map(row => this.mapUser(row));
  }

  async getUserById(userId: string): Promise<DatabaseUser | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, email, name, image, createdAt FROM user WHERE id = ? LIMIT 1',
      [userId]
    )) as [Array<Record<string, unknown>>, unknown];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, email, name, image, createdAt FROM user WHERE email = ? LIMIT 1',
      [email]
    )) as [Array<Record<string, unknown>>, unknown];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapUser(row) : null;
  }

  async getAccountByUserId(userId: string): Promise<DatabaseAccount | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? ORDER BY createdAt DESC LIMIT 1',
      [userId]
    )) as [Array<Record<string, unknown>>, unknown];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapAccount(row) : null;
  }

  async userHasPassword(userId: string): Promise<boolean> {
    const pool = await this.getPool();
    try {
      const [rows] = (await pool.execute(
        "SELECT password FROM account WHERE userId = ? AND providerId = 'credential' LIMIT 1",
        [userId]
      )) as [Array<Record<string, unknown>>, unknown];
      const row = (rows as Array<Record<string, unknown>>)[0];
      return !!(row?.password && String(row.password).length > 0);
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

  async saveAuthState(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void> {
    const pool = await this.getPool();
    await this.ensureAuthStatesTable(pool);
    const exp: Date | null = expiresAt ?? null;
    await pool.execute(
      `INSERT INTO auth_states (state, code_verifier, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
          code_verifier = VALUES(code_verifier),
          expires_at    = VALUES(expires_at),
          created_at    = CURRENT_TIMESTAMP`,
      [state, codeVerifier, exp]
    );
  }

  async getAuthState(state: string): Promise<StoreResult> {
    const pool = await this.getPool();
    await this.ensureAuthStatesTable(pool);
    const [rows] = await pool.execute(
      `SELECT code_verifier, expires_at FROM auth_states WHERE state = ? LIMIT 1`,
      [state]
    );

    const row =
      Array.isArray(rows) && rows.length > 0
        ? (rows as Array<{ code_verifier: string; expires_at: Date | null }>)[0]
        : null;
    if (!row) return StoreResult.notFound();

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (exp && exp.getTime() <= Date.now()) {
      await this.deleteAuthState(state);
      return StoreResult.expired();
    }

    return StoreResult.withCode(row.code_verifier);
  }

  async deleteAuthState(state: string): Promise<void> {
    const pool = await this.getPool();
    await this.ensureAuthStatesTable(pool);
    await pool.execute(`DELETE FROM auth_states WHERE state = ?`, [state]);
  }

  async purgeExpiredAuthStates(): Promise<number> {
    const pool = await this.getPool();
    await this.ensureAuthStatesTable(pool);
    const [result] = await pool.execute(
      `DELETE FROM auth_states WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
    );
    return (result as MysqlExecResult).affectedRows ?? 0;
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
        // Non-fatal cleanup
      }
      try {
        await pool.execute('DELETE FROM account WHERE userId = ?', [userId]);
      } catch {
        // Non-fatal cleanup
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
    const pool = await this.getPool();
    await this.ensureAuthStatesTable(pool);
    return pool;
  }

  private assertConfig(cfg: MysqlConnectionConfig): void {
    const requiredKeys = ['host', 'user', 'password', 'database'] as const;
    const missing = requiredKeys.filter(key => !cfg[key]);
    if (missing.length > 0) {
      throw new Error(`MysqlDatabaseStore config is incomplete. Missing: ${missing.join(', ')}`);
    }
  }

  private async ensureAuthStatesTable(pool: MysqlPool): Promise<void> {
    if (this.authTableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_states (
            state VARCHAR(255) NOT NULL PRIMARY KEY,
            code_verifier VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NULL
            )
    `);

    try {
      await pool.query(`CREATE INDEX idx_auth_states_expires_at ON auth_states (expires_at)`);
    } catch {
      // index already exists
    }
    this.authTableReady = true;
  }
}
