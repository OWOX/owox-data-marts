import type { ProjectMember } from '@owox/idp-protocol';
import { createServiceLogger } from '../core/logger.js';
import type { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import type { DatabaseStore } from './database-store.js';
import { StoreResult } from './store-result.js';

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

/**
 * SQLite-backed DatabaseStore implementation.
 */
export class SqliteDatabaseStore implements DatabaseStore {
  private db?: SqliteDb;
  private readonly logger = createServiceLogger(SqliteDatabaseStore.name);
  private authTableReady = false;
  private projectTablesReady = false;

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

  private ensureAuthStatesTable(): void {
    if (this.authTableReady) return;
    const db = this.getDb();
    db.prepare(
      `CREATE TABLE IF NOT EXISTS auth_states (
      state TEXT NOT NULL PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      expires_at TEXT NULL
    )`
    ).run();
    try {
      db.prepare(`CREATE INDEX idx_auth_states_expires_at ON auth_states (expires_at)`).run();
    } catch {
      // index already exists
    }
    this.authTableReady = true;
  }

  async shutdown(): Promise<void> {
    try {
      (this.db as { close?: () => void } | undefined)?.close?.();
    } catch (error) {
      this.logger.error(
        'Failed to close SQLite database',
        undefined,
        error instanceof Error ? error : undefined
      );
    } finally {
      this.db = undefined;
    }
  }

  async getAdapter(): Promise<unknown> {
    await this.connect();
    this.ensureAuthStatesTable();
    return this.getDb();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.connect();
      this.ensureAuthStatesTable();
      this.getDb().prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    await this.connect();
    this.ensureAuthStatesTable();
  }

  async cleanupExpiredSessions(): Promise<DatabaseOperationResult> {
    await this.connect();
    const stmt = this.getDb().prepare('DELETE FROM session WHERE expiresAt < datetime("now")');
    const result = stmt.run();
    return { changes: Number(result.changes ?? 0) };
  }

  async getUserById(userId: string): Promise<DatabaseUser | null> {
    await this.connect();
    const stmt = this.getDb().prepare('SELECT * FROM user WHERE id = ?');
    const row = stmt.get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    await this.connect();
    const stmt = this.getDb().prepare('SELECT * FROM user WHERE lower(email) = lower(?)');
    const row = stmt.get(email) as Record<string, unknown> | undefined;
    return row ? this.mapUser(row) : null;
  }

  async getAccountByUserId(userId: string): Promise<DatabaseAccount | null> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1'
    );
    const row = stmt.get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapAccount(row) : null;
  }

  async getAccountsByUserId(userId: string): Promise<DatabaseAccount[]> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? ORDER BY updatedAt DESC'
    );
    const rows = stmt.all(userId) as Array<Record<string, unknown>>;
    return rows.map(row => this.mapAccount(row));
  }

  async getAccountByUserIdAndProvider(
    userId: string,
    providerId: string
  ): Promise<DatabaseAccount | null> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? AND providerId = ? ORDER BY updatedAt DESC LIMIT 1'
    );
    const row = stmt.get(userId, providerId) as Record<string, unknown> | undefined;
    return row ? this.mapAccount(row) : null;
  }

  async updateUserLastLoginMethod(userId: string, loginMethod: string): Promise<void> {
    await this.connect();
    this.getDb()
      .prepare('UPDATE user SET lastLoginMethod = ? WHERE id = ?')
      .run(loginMethod, userId);
  }

  async updateUserFirstLoginMethod(userId: string, loginMethod: string): Promise<void> {
    await this.connect();
    this.getDb()
      .prepare('UPDATE user SET firstLoginMethod = ? WHERE id = ? AND firstLoginMethod IS NULL')
      .run(loginMethod, userId);
  }

  async updateUserBiUserId(userId: string, biUserId: string): Promise<void> {
    await this.connect();
    this.getDb()
      .prepare('UPDATE user SET biUserId = ? WHERE id = ? AND biUserId IS NULL')
      .run(biUserId, userId);
  }

  async saveAuthState(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void> {
    await this.connect();
    this.ensureAuthStatesTable();
    const exp: string | null = expiresAt ? expiresAt.toISOString() : null;
    this.getDb()
      .prepare(
        `INSERT INTO auth_states (state, code_verifier, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(state) DO UPDATE SET
           code_verifier = excluded.code_verifier,
           expires_at = excluded.expires_at,
           created_at = CURRENT_TIMESTAMP`
      )
      .run(state, codeVerifier, exp);
  }

  async getAuthState(state: string): Promise<StoreResult> {
    await this.connect();
    this.ensureAuthStatesTable();
    const row = this.getDb()
      .prepare('SELECT code_verifier, expires_at FROM auth_states WHERE state = ? LIMIT 1')
      .get(state) as { code_verifier?: string; expires_at?: string | null } | undefined;

    if (!row || !row.code_verifier) return StoreResult.notFound();

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (exp && exp.getTime() <= Date.now()) {
      await this.deleteAuthState(state);
      return StoreResult.expired();
    }

    await this.deleteAuthState(state);
    return StoreResult.withCode(row.code_verifier);
  }

  async deleteAuthState(state: string): Promise<void> {
    await this.connect();
    this.ensureAuthStatesTable();
    this.getDb().prepare('DELETE FROM auth_states WHERE state = ?').run(state);
  }

  async purgeExpiredAuthStates(): Promise<number> {
    await this.connect();
    this.ensureAuthStatesTable();
    const res = this.getDb()
      .prepare(
        'DELETE FROM auth_states WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP'
      )
      .run();
    return Number(res.changes ?? 0);
  }

  /**
   * Escapes special LIKE pattern characters (%, _, \) to prevent SQL injection.
   */
  private escapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }

  async findActiveMagicLink(
    email: string
  ): Promise<{ id: string; createdAt?: Date | null; expiresAt?: Date | null } | null> {
    await this.connect();
    const escapedEmail = this.escapeLikePattern(email.toLowerCase());
    const pattern = `%\\"email\\":\\"${escapedEmail}\\"%`;
    const row = this.getDb()
      .prepare(
        `SELECT id, createdAt, expiresAt 
         FROM verification 
         WHERE lower(value) LIKE ? 
         ORDER BY expiresAt DESC 
         LIMIT 1`
      )
      .get(pattern) as
      | { id?: string; createdAt?: string | Date | null; expiresAt?: string | Date | null }
      | undefined;

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

  // Project Members Cache methods

  private ensureProjectTables(): void {
    if (this.projectTablesReady) return;
    const db = this.getDb();

    // Project table - stores project-level metadata
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project (
        project_id TEXT NOT NULL PRIMARY KEY,
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        expires_at TEXT NOT NULL
      )`
    ).run();

    // Project member table - stores individual member details
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project_member (
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        full_name TEXT,
        avatar TEXT,
        project_role TEXT NOT NULL,
        user_status TEXT NOT NULL,
        has_notifications_enabled INTEGER NOT NULL DEFAULT 1,
        is_outbound INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE CASCADE
      )`
    ).run();

    // Indexes for performance
    try {
      db.prepare(`CREATE INDEX idx_project_member_project_id ON project_member(project_id)`).run();
    } catch {
      // index already exists
    }
    try {
      db.prepare(`CREATE INDEX idx_project_member_user_id ON project_member(user_id)`).run();
    } catch {
      // index already exists
    }
    try {
      db.prepare(`CREATE INDEX idx_project_expires_at ON project(expires_at)`).run();
    } catch {
      // index already exists
    }

    this.projectTablesReady = true;
  }

  async saveProjectMembers(
    projectId: string,
    members: ProjectMember[],
    ttlSeconds: number
  ): Promise<void> {
    await this.connect();
    this.ensureProjectTables();

    const db = this.getDb();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    // Update project table with sync timestamp
    const projectUpsertStmt = db.prepare(
      `INSERT INTO project (project_id, updated_at, expires_at)
       VALUES (?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         updated_at = CURRENT_TIMESTAMP,
         expires_at = excluded.expires_at`
    );
    projectUpsertStmt.run(projectId, expiresAt);

    // UPSERT members: Insert new or update existing without deleting anything
    // This preserves historical data - members not in the update remain with their current status
    const memberUpsertStmt = db.prepare(
      `INSERT INTO project_member
       (project_id, user_id, email, full_name, avatar, project_role, user_status, has_notifications_enabled, is_outbound, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(project_id, user_id) DO UPDATE SET
         email = excluded.email,
         full_name = excluded.full_name,
         avatar = excluded.avatar,
         project_role = excluded.project_role,
         user_status = excluded.user_status,
         has_notifications_enabled = excluded.has_notifications_enabled,
         is_outbound = excluded.is_outbound,
         updated_at = CURRENT_TIMESTAMP`
    );

    for (const member of members) {
      memberUpsertStmt.run(
        projectId,
        member.userId,
        member.email,
        member.fullName ?? null,
        member.avatar ?? null,
        member.projectRole,
        member.userStatus,
        member.hasNotificationsEnabled ? 1 : 0,
        member.isOutbound ? 1 : 0
      );
    }
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[] | null> {
    await this.connect();
    this.ensureProjectTables();

    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT user_id, email, full_name, avatar, project_role, user_status, has_notifications_enabled, is_outbound
         FROM project_member
         WHERE project_id = ?`
      )
      .all(projectId) as Array<{
      user_id: string;
      email: string;
      full_name: string | null;
      avatar: string | null;
      project_role: string;
      user_status: string;
      has_notifications_enabled: number;
      is_outbound: number;
    }>;

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
      hasNotificationsEnabled: row.has_notifications_enabled === 1,
      isOutbound: row.is_outbound === 1,
    }));

    return members;
  }

  async getProjectSyncInfo(
    projectId: string
  ): Promise<{ expiresAt: Date | null; updatedAt: Date | null } | null> {
    await this.connect();
    this.ensureProjectTables();

    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT expires_at, updated_at
         FROM project
         WHERE project_id = ?`
      )
      .get(projectId) as { expires_at: string | null; updated_at: string | null } | undefined;

    if (!row) {
      return null;
    }

    return {
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
  }
}
