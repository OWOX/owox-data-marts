import { Logger, LoggerFactory } from '@owox/internal-helpers';
import type { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import type { DatabaseStore } from './database-store.js';
import { StoreResult } from './store-result.js';

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

/**
 * MySQL-backed DatabaseStore implementation.
 */
export class MysqlDatabaseStore implements DatabaseStore {
  private pool?: MysqlPool;
  private readonly logger: Logger;
  private authTableReady = false;

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

  private toBoolean(val: unknown): boolean | undefined {
    if (val == null) return undefined;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    if (val instanceof Date) return true;

    if (val instanceof Uint8Array) {
      return val.length > 0 ? val[0] !== 0 : undefined;
    }

    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (!normalized) return undefined;
      if (['1', 'true', 't', 'yes', 'y'].includes(normalized)) return true;
      if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false;
      if (!Number.isNaN(Date.parse(normalized))) return true;
    }

    return undefined;
  }

  private mapUser(row: Record<string, unknown>): DatabaseUser {
    const lastLoginMethod = row.lastLoginMethod ?? row.last_login_method;
    return {
      id: String(row.id),
      email: String(row.email),
      emailVerified: this.toBoolean(row.emailVerified),
      name: row.name != null ? String(row.name) : undefined,
      image: row.image != null ? String(row.image) : null,
      lastLoginMethod: lastLoginMethod != null ? String(lastLoginMethod) : undefined,
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

  async getUserById(userId: string): Promise<DatabaseUser | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute('SELECT * FROM user WHERE id = ? LIMIT 1', [userId])) as [
      Array<Record<string, unknown>>,
      unknown,
    ];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute('SELECT * FROM user WHERE LOWER(email) = LOWER(?) LIMIT 1', [
      email,
    ])) as [Array<Record<string, unknown>>, unknown];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapUser(row) : null;
  }

  async getAccountByUserId(userId: string): Promise<DatabaseAccount | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1',
      [userId]
    )) as [Array<Record<string, unknown>>, unknown];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapAccount(row) : null;
  }

  async getAccountsByUserId(userId: string): Promise<DatabaseAccount[]> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? ORDER BY updatedAt DESC',
      [userId]
    )) as [Array<Record<string, unknown>>, unknown];
    return (rows as Array<Record<string, unknown>>).map(row => this.mapAccount(row));
  }

  async getAccountByUserIdAndProvider(
    userId: string,
    providerId: string
  ): Promise<DatabaseAccount | null> {
    const pool = await this.getPool();
    const [rows] = (await pool.execute(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? AND providerId = ? ORDER BY updatedAt DESC LIMIT 1',
      [userId, providerId]
    )) as [Array<Record<string, unknown>>, unknown];
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapAccount(row) : null;
  }

  async updateUserLastLoginMethod(userId: string, loginMethod: string): Promise<void> {
    const pool = await this.getPool();
    await pool.execute('UPDATE user SET lastLoginMethod = ? WHERE id = ?', [loginMethod, userId]);
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

    await this.deleteAuthState(state);
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

  /**
   * Escapes special LIKE pattern characters (%, _, \) to prevent SQL injection.
   */
  private escapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
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

  async findActiveMagicLink(
    email: string
  ): Promise<{ id: string; createdAt?: Date | null; expiresAt?: Date | null } | null> {
    const pool = await this.getPool();
    const escapedEmail = this.escapeLikePattern(email.toLowerCase());
    const pattern = `%\\"email\\":\\"${escapedEmail}\\"%`;
    const [rows] = (await pool.execute(
      `SELECT id, createdAt, expiresAt 
       FROM verification 
       WHERE LOWER(value) LIKE ? 
       ORDER BY expiresAt DESC 
       LIMIT 1`,
      [pattern]
    )) as [
      Array<{ id?: string; createdAt?: Date | string | null; expiresAt?: Date | string | null }>,
      unknown,
    ];

    const row = (
      rows as Array<{
        id?: string;
        createdAt?: Date | string | null;
        expiresAt?: Date | string | null;
      }>
    )[0];
    if (!row?.id) {
      return null;
    }

    const expiresAt =
      row.expiresAt instanceof Date
        ? row.expiresAt
        : row.expiresAt
          ? new Date(String(row.expiresAt))
          : null;
    const createdAt =
      row.createdAt instanceof Date
        ? row.createdAt
        : row.createdAt
          ? new Date(String(row.createdAt))
          : null;

    return {
      id: String(row.id),
      createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    };
  }
}
