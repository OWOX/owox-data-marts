import type { ProjectMember } from '@owox/idp-protocol';
import { createServiceLogger } from '../core/logger.js';
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
  private readonly logger = createServiceLogger(MysqlDatabaseStore.name);
  private authTableReady = false;
  private projectTablesReady = false;

  constructor(private readonly config: MysqlConnectionConfig) {}

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
      this.logger.error(
        'Failed to initialize MySQL pool',
        undefined,
        error instanceof Error ? error : undefined
      );
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
    const firstLoginMethod = row.firstLoginMethod ?? row.first_login_method;
    const biUserId = row.biUserId ?? row.bi_user_id;
    return {
      id: String(row.id),
      email: String(row.email),
      emailVerified: this.toBoolean(row.emailVerified),
      name: row.name != null ? String(row.name) : undefined,
      image: row.image != null ? String(row.image) : null,
      lastLoginMethod: lastLoginMethod != null ? String(lastLoginMethod) : undefined,
      firstLoginMethod: firstLoginMethod != null ? String(firstLoginMethod) : undefined,
      biUserId: biUserId != null ? String(biUserId) : undefined,
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

  async updateUserFirstLoginMethod(userId: string, loginMethod: string): Promise<void> {
    const pool = await this.getPool();
    await pool.execute(
      'UPDATE user SET firstLoginMethod = ? WHERE id = ? AND firstLoginMethod IS NULL',
      [loginMethod, userId]
    );
  }

  async updateUserBiUserId(userId: string, biUserId: string): Promise<void> {
    const pool = await this.getPool();
    await pool.execute('UPDATE user SET biUserId = ? WHERE id = ? AND biUserId IS NULL', [
      biUserId,
      userId,
    ]);
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
        this.logger.error(
          'Failed to close MySQL pool',
          undefined,
          error instanceof Error ? error : undefined
        );
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

  // Project Members Storage methods

  private async ensureProjectTables(pool: MysqlPool): Promise<void> {
    if (this.projectTablesReady) return;

    // Project table - stores project-level metadata
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project (
        project_id VARCHAR(255) NOT NULL PRIMARY KEY,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);

    // Project member table - stores individual member details
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_member (
        project_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        avatar TEXT,
        project_role VARCHAR(50) NOT NULL,
        user_status VARCHAR(50) NOT NULL,
        has_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_outbound BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, user_id),
        INDEX idx_project_member_project_id (project_id),
        INDEX idx_project_member_user_id (user_id),
        FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE CASCADE
      )
    `);

    this.projectTablesReady = true;
  }

  async saveProjectMembers(
    projectId: string,
    members: ProjectMember[],
    ttlSeconds: number
  ): Promise<void> {
    const pool = await this.getPool();
    await this.ensureProjectTables(pool);

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Update project table with sync timestamp
    await pool.execute(
      `INSERT INTO project (project_id, updated_at, expires_at)
       VALUES (?, CURRENT_TIMESTAMP, ?)
       ON DUPLICATE KEY UPDATE
         updated_at = CURRENT_TIMESTAMP,
         expires_at = VALUES(expires_at)`,
      [projectId, expiresAt]
    );

    // UPSERT members: Insert new or update existing without deleting anything
    // This preserves historical data - members not in the update remain with their current status
    for (const member of members) {
      await pool.execute(
        `INSERT INTO project_member
         (project_id, user_id, email, full_name, avatar, project_role, user_status, has_notifications_enabled, is_outbound)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           full_name = VALUES(full_name),
           avatar = VALUES(avatar),
           project_role = VALUES(project_role),
           user_status = VALUES(user_status),
           has_notifications_enabled = VALUES(has_notifications_enabled),
           is_outbound = VALUES(is_outbound)`,
        [
          projectId,
          member.userId,
          member.email,
          member.fullName ?? null,
          member.avatar ?? null,
          member.projectRole,
          member.userStatus,
          member.hasNotificationsEnabled ? 1 : 0,
          member.isOutbound ? 1 : 0,
        ]
      );
    }
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[] | null> {
    const pool = await this.getPool();
    await this.ensureProjectTables(pool);

    const [rows] = (await pool.execute(
      `SELECT user_id, email, full_name, avatar, project_role, user_status, has_notifications_enabled, is_outbound
       FROM project_member
       WHERE project_id = ?`,
      [projectId]
    )) as [
      Array<{
        user_id: string;
        email: string;
        full_name: string | null;
        avatar: string | null;
        project_role: string;
        user_status: string;
        has_notifications_enabled: number | boolean;
        is_outbound: number | boolean;
      }>,
      unknown,
    ];

    if (!rows || rows.length === 0) {
      return null;
    }

    const members: ProjectMember[] = rows.map(row => ({
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name ?? undefined,
      avatar: row.avatar ?? undefined,
      projectRole: row.project_role,
      userStatus: row.user_status as ProjectMember['userStatus'],
      hasNotificationsEnabled:
        typeof row.has_notifications_enabled === 'boolean'
          ? row.has_notifications_enabled
          : row.has_notifications_enabled === 1,
      isOutbound: typeof row.is_outbound === 'boolean' ? row.is_outbound : row.is_outbound === 1,
    }));

    return members;
  }

  async getProjectSyncInfo(
    projectId: string
  ): Promise<{ expiresAt: Date | null; updatedAt: Date | null } | null> {
    const pool = await this.getPool();
    await this.ensureProjectTables(pool);

    const [rows] = (await pool.execute(
      `SELECT expires_at, updated_at
       FROM project
       WHERE project_id = ?`,
      [projectId]
    )) as [Array<{ expires_at: Date | string | null; updated_at: Date | string | null }>, unknown];

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      expiresAt:
        row.expires_at instanceof Date
          ? row.expires_at
          : row.expires_at
            ? new Date(row.expires_at)
            : null,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at
          : row.updated_at
            ? new Date(row.updated_at)
            : null,
    };
  }
}
